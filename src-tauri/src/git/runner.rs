use super::error::{GitError, GitErrorKind};
use std::io;
use std::path::Path;
use std::process::{Command, Stdio};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RefKind {
    Branch,
    Tag,
}

/// Common environment for every git invocation. Arguments are passed as an
/// array, never through a shell.
pub fn git_command(repo: &Path, args: &[&str]) -> Command {
    let mut cmd = Command::new("git");
    cmd.args(args)
        .current_dir(repo)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("LC_ALL", "C")
        .stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd
}

pub(crate) fn spawn_error(err: io::Error) -> GitError {
    if err.kind() == io::ErrorKind::NotFound {
        GitError::new(GitErrorKind::GitNotFound, err.to_string())
    } else {
        GitError::new(GitErrorKind::Failed, err.to_string())
    }
}

pub fn run_git(repo: &Path, args: &[&str]) -> Result<String, GitError> {
    run_git_allow_codes(repo, args, &[0])
}

/// Like `run_git` but also accepts the given exit codes as success (for
/// example `diff --no-index`, which exits 1 when the files differ).
pub fn run_git_allow_codes(
    repo: &Path,
    args: &[&str],
    ok_codes: &[i32],
) -> Result<String, GitError> {
    // Without this check a missing directory would look like a missing git binary.
    if !repo.is_dir() {
        return Err(GitError::new(
            GitErrorKind::RepoNotFound,
            repo.display().to_string(),
        ));
    }
    let output = git_command(repo, args).output().map_err(spawn_error)?;
    if output.status.code().is_some_and(|c| ok_codes.contains(&c)) {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(GitError::new(
            GitErrorKind::Failed,
            String::from_utf8_lossy(&output.stderr).into_owned(),
        ))
    }
}

pub fn validate_ref_name(repo: &Path, kind: RefKind, name: &str) -> Result<(), GitError> {
    // A leading dash would be read as an option by later git commands, and
    // `refs/tags/-x` is otherwise a valid ref name.
    if name.starts_with('-') {
        return Err(GitError::new(GitErrorKind::InvalidName, name));
    }
    let result = match kind {
        RefKind::Branch => run_git(repo, &["check-ref-format", "--branch", name]),
        RefKind::Tag => {
            let full = format!("refs/tags/{name}");
            run_git(repo, &["check-ref-format", &full])
        }
    };
    match result {
        Ok(_) => Ok(()),
        Err(e) if e.kind == GitErrorKind::Failed => {
            Err(GitError::new(GitErrorKind::InvalidName, name))
        }
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestRepo;
    use std::fs;

    #[test]
    fn run_git_returns_stdout() {
        let repo = TestRepo::new();
        let hash = repo.commit("one", &[("a.txt", "a")]);
        let out = run_git(repo.path(), &["rev-parse", "HEAD"]).unwrap();
        assert_eq!(out.trim(), hash);
    }

    #[test]
    fn run_git_failure_carries_stderr() {
        let repo = TestRepo::new();
        repo.commit("one", &[("a.txt", "a")]);
        let err = run_git(repo.path(), &["rev-parse", "nope"]).unwrap_err();
        assert_eq!(err.kind, GitErrorKind::Failed);
        assert!(err.message.contains("nope"), "{}", err.message);
    }

    #[test]
    fn status_does_not_touch_index() {
        let repo = TestRepo::new();
        repo.commit("one", &[("a.txt", "a")]);
        let index = repo.path().join(".git/index");
        let before = fs::metadata(&index).unwrap().modified().unwrap();
        // Push the tracked file's mtime past the index's so that a plain
        // `git status` would see stale stat data and rewrite the index.
        let file = fs::OpenOptions::new()
            .write(true)
            .open(repo.path().join("a.txt"))
            .unwrap();
        file.set_modified(before + std::time::Duration::from_secs(10))
            .unwrap();
        drop(file);
        run_git(repo.path(), &["status", "--porcelain"]).unwrap();
        let after = fs::metadata(&index).unwrap().modified().unwrap();
        assert_eq!(before, after);
    }

    #[test]
    fn validate_ref_name_rejects_bad_names() {
        let repo = TestRepo::new();
        for bad in ["a..b", "-x", "x.lock"] {
            let err = validate_ref_name(repo.path(), RefKind::Branch, bad).unwrap_err();
            assert_eq!(err.kind, GitErrorKind::InvalidName, "{bad}");
            let err = validate_ref_name(repo.path(), RefKind::Tag, bad).unwrap_err();
            assert_eq!(err.kind, GitErrorKind::InvalidName, "{bad}");
        }
        validate_ref_name(repo.path(), RefKind::Branch, "feat/x").unwrap();
        validate_ref_name(repo.path(), RefKind::Tag, "v1.0").unwrap();
    }

    #[test]
    fn missing_dir_is_repo_not_found() {
        let err = run_git(Path::new("/nonexistent/git-forest"), &["status"]).unwrap_err();
        assert_eq!(err.kind, GitErrorKind::RepoNotFound);
    }
}
