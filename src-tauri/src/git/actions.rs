use super::error::{GitError, GitErrorKind};
use super::runner::{run_git, run_git_allow_codes, validate_ref_name, RefKind};
use crate::repos::resolve_repo;
use std::path::Path;
use tauri::AppHandle;

/// Resolves a user-supplied revision to a full commit hash. Option-like
/// values are rejected before git sees them.
fn resolve_commit_hash(repo: &Path, rev: &str) -> Result<String, GitError> {
    if rev.starts_with('-') {
        return Err(GitError::new(GitErrorKind::InvalidName, rev));
    }
    let spec = format!("{rev}^{{commit}}");
    let out = run_git(repo, &["rev-parse", "--verify", "--end-of-options", &spec])?;
    Ok(out.trim().to_string())
}

fn local_branch_exists(repo: &Path, name: &str) -> Result<bool, GitError> {
    let local = format!("refs/heads/{name}");
    let out = run_git_allow_codes(repo, &["rev-parse", "--verify", "-q", &local], &[0, 1])?;
    Ok(!out.trim().is_empty())
}

pub fn do_checkout_branch(repo: &Path, name: &str) -> Result<(), GitError> {
    validate_ref_name(repo, RefKind::Branch, name)?;
    // Without this a tag or commit-ish of that name would detach HEAD.
    if !local_branch_exists(repo, name)? {
        return Err(GitError::new(
            GitErrorKind::Failed,
            format!("no local branch named {name}"),
        ));
    }
    run_git(repo, &["checkout", name, "--"]).map(drop)
}

pub fn do_checkout_commit(repo: &Path, hash: &str) -> Result<(), GitError> {
    let full = resolve_commit_hash(repo, hash)?;
    run_git(repo, &["checkout", "--detach", &full, "--"]).map(drop)
}

pub fn do_checkout_remote_branch(repo: &Path, remote: &str, name: &str) -> Result<(), GitError> {
    validate_ref_name(repo, RefKind::Branch, remote)?;
    validate_ref_name(repo, RefKind::Branch, name)?;
    if local_branch_exists(repo, name)? {
        return run_git(repo, &["checkout", name, "--"]).map(drop);
    }
    let target = format!("{remote}/{name}");
    run_git(repo, &["checkout", "--track", &target]).map(drop)
}

pub fn do_create_branch(repo: &Path, name: &str, at: &str, checkout: bool) -> Result<(), GitError> {
    validate_ref_name(repo, RefKind::Branch, name)?;
    let full = resolve_commit_hash(repo, at)?;
    let args: &[&str] = if checkout {
        &["checkout", "-b", name, &full]
    } else {
        &["branch", name, &full]
    };
    run_git(repo, args).map(drop)
}

pub fn do_rename_branch(repo: &Path, old: &str, new: &str) -> Result<(), GitError> {
    validate_ref_name(repo, RefKind::Branch, old)?;
    validate_ref_name(repo, RefKind::Branch, new)?;
    run_git(repo, &["branch", "-m", old, new]).map(drop)
}

pub fn do_delete_branch(repo: &Path, name: &str, force: bool) -> Result<(), GitError> {
    validate_ref_name(repo, RefKind::Branch, name)?;
    let flag = if force { "-D" } else { "-d" };
    run_git(repo, &["branch", flag, name]).map(drop)
}

pub fn do_add_tag(
    repo: &Path,
    name: &str,
    at: &str,
    message: Option<&str>,
) -> Result<(), GitError> {
    validate_ref_name(repo, RefKind::Tag, name)?;
    let full = resolve_commit_hash(repo, at)?;
    match message {
        Some(msg) => run_git(repo, &["tag", "-a", "-m", msg, name, &full]),
        None => run_git(repo, &["tag", name, &full]),
    }
    .map(drop)
}

pub fn do_delete_tag(repo: &Path, name: &str) -> Result<(), GitError> {
    validate_ref_name(repo, RefKind::Tag, name)?;
    run_git(repo, &["tag", "-d", name]).map(drop)
}

#[tauri::command(async)]
pub fn checkout_branch(app: AppHandle, repo: String, name: String) -> Result<(), GitError> {
    do_checkout_branch(&resolve_repo(&app, &repo)?, &name)
}

#[tauri::command(async)]
pub fn checkout_commit(app: AppHandle, repo: String, hash: String) -> Result<(), GitError> {
    do_checkout_commit(&resolve_repo(&app, &repo)?, &hash)
}

#[tauri::command(async)]
pub fn checkout_remote_branch(
    app: AppHandle,
    repo: String,
    remote: String,
    name: String,
) -> Result<(), GitError> {
    do_checkout_remote_branch(&resolve_repo(&app, &repo)?, &remote, &name)
}

#[tauri::command(async)]
pub fn create_branch(
    app: AppHandle,
    repo: String,
    name: String,
    at: String,
    checkout: bool,
) -> Result<(), GitError> {
    do_create_branch(&resolve_repo(&app, &repo)?, &name, &at, checkout)
}

#[tauri::command(async)]
pub fn rename_branch(
    app: AppHandle,
    repo: String,
    old: String,
    new: String,
) -> Result<(), GitError> {
    do_rename_branch(&resolve_repo(&app, &repo)?, &old, &new)
}

#[tauri::command(async)]
pub fn delete_branch(
    app: AppHandle,
    repo: String,
    name: String,
    force: bool,
) -> Result<(), GitError> {
    do_delete_branch(&resolve_repo(&app, &repo)?, &name, force)
}

#[tauri::command(async)]
pub fn add_tag(
    app: AppHandle,
    repo: String,
    name: String,
    at: String,
    message: Option<String>,
) -> Result<(), GitError> {
    do_add_tag(&resolve_repo(&app, &repo)?, &name, &at, message.as_deref())
}

#[tauri::command(async)]
pub fn delete_tag(app: AppHandle, repo: String, name: String) -> Result<(), GitError> {
    do_delete_tag(&resolve_repo(&app, &repo)?, &name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestRepo;
    use std::fs;

    fn branches(repo: &TestRepo) -> Vec<String> {
        repo.git(&["for-each-ref", "--format=%(refname:short)", "refs/heads"])
            .lines()
            .map(String::from)
            .collect()
    }

    #[test]
    fn checkout_refuses_to_overwrite_local_changes() {
        let repo = TestRepo::new();
        repo.commit("one", &[("a.txt", "one")]);
        repo.git(&["branch", "other"]);
        repo.git(&["checkout", "-q", "other"]);
        repo.commit("two", &[("a.txt", "two")]);
        repo.git(&["checkout", "-q", "main"]);
        fs::write(repo.path().join("a.txt"), "dirty").unwrap();
        let err = do_checkout_branch(repo.path(), "other").unwrap_err();
        assert_eq!(err.kind, GitErrorKind::Failed);
        assert!(err.message.contains("a.txt"), "{}", err.message);
        assert_eq!(
            fs::read_to_string(repo.path().join("a.txt")).unwrap(),
            "dirty"
        );
        assert_eq!(repo.git(&["branch", "--show-current"]), "main");
    }

    #[test]
    fn checkout_branch_and_commit_detach() {
        let repo = TestRepo::new();
        let first = repo.commit("one", &[("a.txt", "one")]);
        repo.commit("two", &[("a.txt", "two")]);
        repo.git(&["branch", "other", &first]);
        do_checkout_branch(repo.path(), "other").unwrap();
        assert_eq!(repo.git(&["branch", "--show-current"]), "other");
        do_checkout_branch(repo.path(), "main").unwrap();
        do_checkout_commit(repo.path(), &first).unwrap();
        assert_eq!(repo.git(&["branch", "--show-current"]), "");
        assert_eq!(repo.git(&["rev-parse", "HEAD"]), first);
        assert!(do_checkout_commit(repo.path(), "--orphan").is_err());
    }

    fn with_remote() -> (TestRepo, TestRepo) {
        let upstream = TestRepo::new();
        upstream.commit("one", &[("a.txt", "one")]);
        upstream.git(&["branch", "feat"]);
        let clone = TestRepo::new();
        clone.commit("local", &[("b.txt", "b")]);
        clone.git(&["remote", "add", "origin", upstream.path().to_str().unwrap()]);
        clone.git(&["fetch", "-q", "origin"]);
        (upstream, clone)
    }

    #[test]
    fn checkout_remote_branch_creates_tracking_branch() {
        let (_up, clone) = with_remote();
        do_checkout_remote_branch(clone.path(), "origin", "feat").unwrap();
        assert_eq!(clone.git(&["branch", "--show-current"]), "feat");
        assert_eq!(
            clone.git(&["rev-parse", "--abbrev-ref", "feat@{upstream}"]),
            "origin/feat"
        );
    }

    #[test]
    fn checkout_remote_branch_switches_to_existing_local() {
        let (_up, clone) = with_remote();
        // Local `feat` deliberately differs from origin/feat and must stay put.
        let local = clone.git(&["rev-parse", "HEAD"]);
        clone.git(&["branch", "feat", &local]);
        do_checkout_remote_branch(clone.path(), "origin", "feat").unwrap();
        assert_eq!(clone.git(&["branch", "--show-current"]), "feat");
        assert_eq!(clone.git(&["rev-parse", "HEAD"]), local);
    }

    #[test]
    fn delete_unmerged_branch_without_force_fails() {
        let repo = TestRepo::new();
        repo.commit("one", &[("a.txt", "one")]);
        repo.git(&["checkout", "-q", "-b", "wip"]);
        repo.commit("two", &[("a.txt", "two")]);
        repo.git(&["checkout", "-q", "main"]);
        let err = do_delete_branch(repo.path(), "wip", false).unwrap_err();
        assert_eq!(err.kind, GitErrorKind::Failed);
        assert!(err.message.contains("not fully merged"), "{}", err.message);
        assert!(branches(&repo).contains(&"wip".to_string()));
    }

    #[test]
    fn delete_unmerged_branch_with_force_succeeds() {
        let repo = TestRepo::new();
        repo.commit("one", &[("a.txt", "one")]);
        repo.git(&["checkout", "-q", "-b", "wip"]);
        repo.commit("two", &[("a.txt", "two")]);
        repo.git(&["checkout", "-q", "main"]);
        do_delete_branch(repo.path(), "wip", true).unwrap();
        assert_eq!(branches(&repo), ["main"]);
    }

    #[test]
    fn create_rename_delete_branch_roundtrip() {
        let repo = TestRepo::new();
        let first = repo.commit("one", &[("a.txt", "one")]);
        repo.commit("two", &[("a.txt", "two")]);
        do_create_branch(repo.path(), "feat/a", &first, false).unwrap();
        assert_eq!(repo.git(&["rev-parse", "feat/a"]), first);
        assert_eq!(repo.git(&["branch", "--show-current"]), "main");
        do_rename_branch(repo.path(), "feat/a", "feat/b").unwrap();
        assert_eq!(branches(&repo), ["feat/b", "main"]);
        do_delete_branch(repo.path(), "feat/b", false).unwrap();
        assert_eq!(branches(&repo), ["main"]);
        do_create_branch(repo.path(), "co", "main", true).unwrap();
        assert_eq!(repo.git(&["branch", "--show-current"]), "co");
        assert!(do_create_branch(repo.path(), "x", "--bogus", false).is_err());
    }

    #[test]
    fn annotated_and_lightweight_tags() {
        let repo = TestRepo::new();
        let first = repo.commit("one", &[("a.txt", "one")]);
        do_add_tag(repo.path(), "light", &first, None).unwrap();
        do_add_tag(repo.path(), "ann", &first, Some("hello")).unwrap();
        do_add_tag(repo.path(), "empty", &first, Some("")).unwrap();
        assert_eq!(repo.git(&["cat-file", "-t", "light"]), "commit");
        assert_eq!(repo.git(&["cat-file", "-t", "ann"]), "tag");
        assert_eq!(repo.git(&["cat-file", "-t", "empty"]), "tag");
        assert!(do_add_tag(repo.path(), "light", &first, None).is_err());
        do_delete_tag(repo.path(), "light").unwrap();
        assert_eq!(repo.git(&["tag", "-l", "light"]), "");
    }

    #[test]
    fn checkout_branch_requires_a_local_branch() {
        let repo = TestRepo::new();
        let first = repo.commit("one", &[("a.txt", "one")]);
        repo.commit("two", &[("a.txt", "two")]);
        repo.git(&["tag", "v1", &first]);
        let err = do_checkout_branch(repo.path(), "v1").unwrap_err();
        assert_eq!(err.kind, GitErrorKind::Failed);
        assert_eq!(repo.git(&["branch", "--show-current"]), "main");
    }

    #[test]
    fn previous_branch_shorthand_cannot_delete_a_branch() {
        let repo = TestRepo::new();
        repo.commit("one", &[("a.txt", "one")]);
        repo.git(&["checkout", "-q", "-b", "other"]);
        repo.git(&["checkout", "-q", "main"]);
        let err = do_delete_branch(repo.path(), "@{-1}", true).unwrap_err();
        assert_eq!(err.kind, GitErrorKind::InvalidName);
        assert_eq!(branches(&repo), ["main", "other"]);
    }

    #[test]
    fn invalid_names_are_rejected_before_git_runs() {
        let repo = TestRepo::new();
        let first = repo.commit("one", &[("a.txt", "one")]);
        let kind = |r: Result<(), GitError>| r.unwrap_err().kind;
        assert_eq!(
            kind(do_checkout_branch(repo.path(), "bad..name")),
            GitErrorKind::InvalidName
        );
        assert_eq!(
            kind(do_create_branch(repo.path(), "bad..name", &first, false)),
            GitErrorKind::InvalidName
        );
        assert_eq!(
            kind(do_rename_branch(repo.path(), "main", "-x")),
            GitErrorKind::InvalidName
        );
        assert_eq!(
            kind(do_delete_branch(repo.path(), "bad..name", true)),
            GitErrorKind::InvalidName
        );
        assert_eq!(
            kind(do_add_tag(repo.path(), "bad..name", &first, None)),
            GitErrorKind::InvalidName
        );
        assert_eq!(
            kind(do_delete_tag(repo.path(), "bad..name")),
            GitErrorKind::InvalidName
        );
        assert_eq!(
            kind(do_checkout_remote_branch(
                repo.path(),
                "origin",
                "bad..name"
            )),
            GitErrorKind::InvalidName
        );
        assert_eq!(
            kind(do_checkout_commit(repo.path(), "-x")),
            GitErrorKind::InvalidName
        );
    }
}
