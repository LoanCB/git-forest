use crate::git::error::{GitError, GitErrorKind};
use crate::git::runner::run_git;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "git-forest.json";
const REPOS_KEY: &str = "repos";
const SCAN_MAX_DEPTH: usize = 4;
const SKIPPED_DIRS: [&str; 5] = ["node_modules", "target", "dist", "vendor", "build"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoEntry {
    pub path: String,
    pub name: String,
}

fn store_error(err: impl std::fmt::Display) -> GitError {
    GitError::new(GitErrorKind::Failed, err.to_string())
}

fn load_repos(app: &AppHandle) -> Result<Vec<RepoEntry>, GitError> {
    let store = app.store(STORE_FILE).map_err(store_error)?;
    Ok(store
        .get(REPOS_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default())
}

fn save_repos(app: &AppHandle, repos: &[RepoEntry]) -> Result<(), GitError> {
    let store = app.store(STORE_FILE).map_err(store_error)?;
    store.set(REPOS_KEY, serde_json::to_value(repos).map_err(store_error)?);
    store.save().map_err(store_error)
}

/// Canonical form when the directory exists, the raw path otherwise.
fn normalize(path: &str) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| PathBuf::from(path))
}

pub fn check_registered(list: &[RepoEntry], path: &str) -> Result<PathBuf, GitError> {
    let wanted = normalize(path);
    let entry = list
        .iter()
        .find(|e| normalize(&e.path) == wanted)
        .ok_or_else(|| GitError::new(GitErrorKind::NotRegistered, path))?;
    let dir = PathBuf::from(&entry.path);
    if !dir.is_dir() {
        return Err(GitError::new(
            GitErrorKind::RepoNotFound,
            entry.path.clone(),
        ));
    }
    Ok(dir)
}

/// Every git command of the app resolves its repository through here.
pub fn resolve_repo(app: &AppHandle, path: &str) -> Result<PathBuf, GitError> {
    check_registered(&load_repos(app)?, path)
}

pub fn scan_for_repos(root: &Path, max_depth: usize) -> Vec<PathBuf> {
    let mut found = Vec::new();
    scan_dir(root, 0, max_depth, &mut found);
    found.sort();
    found
}

fn scan_dir(dir: &Path, depth: usize, max_depth: usize, found: &mut Vec<PathBuf>) {
    if dir.join(".git").exists() {
        found.push(dir.to_path_buf());
        return;
    }
    if depth >= max_depth {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') || SKIPPED_DIRS.contains(&name.as_ref()) {
            continue;
        }
        // file_type() does not follow symlinks, which avoids cycles.
        if entry.file_type().is_ok_and(|t| t.is_dir()) {
            scan_dir(&entry.path(), depth + 1, max_depth, found);
        }
    }
}

#[tauri::command]
pub fn list_repos(app: AppHandle) -> Result<Vec<RepoEntry>, GitError> {
    load_repos(&app)
}

#[tauri::command]
pub fn add_repo(app: AppHandle, path: String) -> Result<RepoEntry, GitError> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(GitError::new(GitErrorKind::RepoNotFound, path));
    }
    let top = run_git(dir, &["rev-parse", "--show-toplevel"]).map_err(|e| {
        if e.kind == GitErrorKind::Failed {
            GitError::new(GitErrorKind::NotARepo, e.message)
        } else {
            e
        }
    })?;
    let top = top.trim();
    let entry = RepoEntry {
        path: top.to_string(),
        name: Path::new(top)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| top.to_string()),
    };
    let mut repos = load_repos(&app)?;
    let wanted = normalize(top);
    if let Some(existing) = repos.iter().find(|e| normalize(&e.path) == wanted) {
        return Ok(existing.clone());
    }
    repos.push(entry.clone());
    save_repos(&app, &repos)?;
    Ok(entry)
}

#[tauri::command]
pub fn remove_repo(app: AppHandle, path: String) -> Result<(), GitError> {
    let wanted = normalize(&path);
    let mut repos = load_repos(&app)?;
    repos.retain(|e| normalize(&e.path) != wanted);
    save_repos(&app, &repos)
}

#[tauri::command]
pub fn scan_repos(root: String) -> Result<Vec<String>, GitError> {
    let root = Path::new(&root);
    if !root.is_dir() {
        return Err(GitError::new(
            GitErrorKind::RepoNotFound,
            root.display().to_string(),
        ));
    }
    Ok(scan_for_repos(root, SCAN_MAX_DEPTH)
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect())
}

#[tauri::command]
pub fn repo_exists(path: String) -> bool {
    Path::new(&path).is_dir()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mkrepo(root: &Path, rel: &str) {
        fs::create_dir_all(root.join(rel).join(".git")).unwrap();
    }

    #[test]
    fn scan_finds_nested_repos_and_stops_inside_them() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        mkrepo(root, "a");
        mkrepo(root, "b/c");
        mkrepo(root, "a/sub");
        mkrepo(root, "node_modules/d");
        mkrepo(root, ".hidden/e");
        assert_eq!(
            scan_for_repos(root, 4),
            vec![root.join("a"), root.join("b/c")]
        );
    }

    #[test]
    fn scan_respects_max_depth() {
        let tmp = tempfile::tempdir().unwrap();
        mkrepo(tmp.path(), "a/b/c/d/e");
        assert!(scan_for_repos(tmp.path(), 4).is_empty());
        assert_eq!(scan_for_repos(tmp.path(), 5).len(), 1);
    }

    #[test]
    fn missing_repo_is_reported() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("gone");
        fs::create_dir(&path).unwrap();
        let list = vec![RepoEntry {
            path: path.to_string_lossy().into_owned(),
            name: "gone".into(),
        }];
        assert!(check_registered(&list, &list[0].path).is_ok());
        fs::remove_dir(&path).unwrap();
        let err = check_registered(&list, &list[0].path).unwrap_err();
        assert_eq!(err.kind, GitErrorKind::RepoNotFound);
    }

    #[test]
    fn unregistered_repo_is_refused() {
        let tmp = tempfile::tempdir().unwrap();
        let err = check_registered(&[], &tmp.path().to_string_lossy()).unwrap_err();
        assert_eq!(err.kind, GitErrorKind::NotRegistered);
    }
}
