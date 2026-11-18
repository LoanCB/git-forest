use super::error::{GitError, GitErrorKind};
use super::ops::{run_cancellable, OpRegistry};
use super::runner::{run_git, validate_ref_name, RefKind};
use crate::repos::resolve_repo;
use std::path::Path;
use tauri::{AppHandle, State};

fn validate_remote(repo: &Path, remote: &str) -> Result<(), GitError> {
    let remotes = run_git(repo, &["remote"])?;
    if remotes.lines().any(|r| r == remote) {
        Ok(())
    } else {
        Err(GitError::new(GitErrorKind::InvalidName, remote))
    }
}

pub async fn do_fetch(
    ops: &OpRegistry,
    op_id: &str,
    repo: &Path,
    prune: bool,
) -> Result<(), GitError> {
    let mut args = vec!["fetch", "--all", "--tags"];
    if prune {
        args.push("--prune");
    }
    run_cancellable(ops, op_id, repo, &args).await.map(drop)
}

// Refspecs are spelled out in full: a bare name could match both a branch and
// a tag, and a leading `+` would turn the push into a forced one.

pub async fn do_push_branch(
    ops: &OpRegistry,
    op_id: &str,
    repo: &Path,
    remote: &str,
    name: &str,
    set_upstream: bool,
) -> Result<(), GitError> {
    validate_remote(repo, remote)?;
    validate_ref_name(repo, RefKind::Branch, name)?;
    let refspec = format!("refs/heads/{name}:refs/heads/{name}");
    let mut args = vec!["push"];
    if set_upstream {
        args.push("--set-upstream");
    }
    args.extend([remote, &refspec]);
    run_cancellable(ops, op_id, repo, &args).await.map(drop)
}

pub async fn do_push_tag(
    ops: &OpRegistry,
    op_id: &str,
    repo: &Path,
    remote: &str,
    name: &str,
) -> Result<(), GitError> {
    validate_remote(repo, remote)?;
    validate_ref_name(repo, RefKind::Tag, name)?;
    let refspec = format!("refs/tags/{name}:refs/tags/{name}");
    run_cancellable(ops, op_id, repo, &["push", remote, &refspec])
        .await
        .map(drop)
}

pub async fn do_delete_remote_branch(
    ops: &OpRegistry,
    op_id: &str,
    repo: &Path,
    remote: &str,
    name: &str,
) -> Result<(), GitError> {
    validate_remote(repo, remote)?;
    validate_ref_name(repo, RefKind::Branch, name)?;
    let target = format!("refs/heads/{name}");
    run_cancellable(ops, op_id, repo, &["push", remote, "--delete", &target])
        .await
        .map(drop)
}

pub async fn do_delete_remote_tag(
    ops: &OpRegistry,
    op_id: &str,
    repo: &Path,
    remote: &str,
    name: &str,
) -> Result<(), GitError> {
    validate_remote(repo, remote)?;
    validate_ref_name(repo, RefKind::Tag, name)?;
    let target = format!("refs/tags/{name}");
    run_cancellable(ops, op_id, repo, &["push", remote, "--delete", &target])
        .await
        .map(drop)
}

#[tauri::command]
pub async fn fetch(
    app: AppHandle,
    ops: State<'_, OpRegistry>,
    op_id: String,
    repo: String,
    prune: bool,
) -> Result<(), GitError> {
    do_fetch(&ops, &op_id, &resolve_repo(&app, &repo)?, prune).await
}

#[tauri::command]
pub async fn push_branch(
    app: AppHandle,
    ops: State<'_, OpRegistry>,
    op_id: String,
    repo: String,
    remote: String,
    name: String,
    set_upstream: bool,
) -> Result<(), GitError> {
    let repo = resolve_repo(&app, &repo)?;
    do_push_branch(&ops, &op_id, &repo, &remote, &name, set_upstream).await
}

#[tauri::command]
pub async fn push_tag(
    app: AppHandle,
    ops: State<'_, OpRegistry>,
    op_id: String,
    repo: String,
    remote: String,
    name: String,
) -> Result<(), GitError> {
    do_push_tag(&ops, &op_id, &resolve_repo(&app, &repo)?, &remote, &name).await
}

#[tauri::command]
pub async fn delete_remote_branch(
    app: AppHandle,
    ops: State<'_, OpRegistry>,
    op_id: String,
    repo: String,
    remote: String,
    name: String,
) -> Result<(), GitError> {
    let repo = resolve_repo(&app, &repo)?;
    do_delete_remote_branch(&ops, &op_id, &repo, &remote, &name).await
}

#[tauri::command]
pub async fn delete_remote_tag(
    app: AppHandle,
    ops: State<'_, OpRegistry>,
    op_id: String,
    repo: String,
    remote: String,
    name: String,
) -> Result<(), GitError> {
    let repo = resolve_repo(&app, &repo)?;
    do_delete_remote_tag(&ops, &op_id, &repo, &remote, &name).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestRepo;

    /// A bare remote and a clone that has pushed one commit on `main`.
    fn with_remote() -> (TestRepo, TestRepo) {
        let remote = TestRepo::bare();
        let local = TestRepo::new();
        local.commit("one", &[("a.txt", "one")]);
        local.git(&["remote", "add", "origin", remote.path().to_str().unwrap()]);
        local.git(&["push", "-q", "origin", "main"]);
        (remote, local)
    }

    fn has_ref(repo: &TestRepo, name: &str) -> bool {
        !repo.git(&["for-each-ref", name]).is_empty()
    }

    #[tokio::test]
    async fn fetch_gets_new_remote_commits_and_prunes() {
        let ops = OpRegistry::default();
        let (remote, local) = with_remote();
        let other = TestRepo::new();
        other.git(&["remote", "add", "origin", remote.path().to_str().unwrap()]);
        other.git(&["fetch", "-q", "origin"]);
        other.git(&["checkout", "-q", "-B", "main", "origin/main"]);
        let new = other.commit("two", &[("a.txt", "two")]);
        other.git(&["push", "-q", "origin", "main", "main:refs/heads/gone"]);
        other.git(&["tag", "v1"]);
        other.git(&["push", "-q", "origin", "v1"]);

        do_fetch(&ops, "f1", local.path(), false).await.unwrap();
        assert_eq!(local.git(&["rev-parse", "origin/main"]), new);
        assert!(has_ref(&local, "refs/remotes/origin/gone"));
        assert!(has_ref(&local, "refs/tags/v1"));

        other.git(&["push", "-q", "origin", "--delete", "gone"]);
        do_fetch(&ops, "f2", local.path(), false).await.unwrap();
        assert!(has_ref(&local, "refs/remotes/origin/gone"));
        do_fetch(&ops, "f3", local.path(), true).await.unwrap();
        assert!(!has_ref(&local, "refs/remotes/origin/gone"));
        assert!(ops.is_empty());
    }

    #[tokio::test]
    async fn push_branch_sets_upstream() {
        let ops = OpRegistry::default();
        let (remote, local) = with_remote();
        local.git(&["checkout", "-q", "-b", "feat"]);
        let hash = local.commit("feat", &[("b.txt", "b")]);
        do_push_branch(&ops, "p1", local.path(), "origin", "feat", true)
            .await
            .unwrap();
        assert_eq!(remote.git(&["rev-parse", "refs/heads/feat"]), hash);
        assert_eq!(
            local.git(&["rev-parse", "--abbrev-ref", "feat@{upstream}"]),
            "origin/feat"
        );

        do_delete_remote_branch(&ops, "d1", local.path(), "origin", "feat")
            .await
            .unwrap();
        assert!(!has_ref(&remote, "refs/heads/feat"));
        assert!(has_ref(&remote, "refs/heads/main"));
    }

    #[tokio::test]
    async fn push_and_delete_remote_tag() {
        let ops = OpRegistry::default();
        let (remote, local) = with_remote();
        local.git(&["tag", "-a", "-m", "release", "v1"]);
        do_push_tag(&ops, "t1", local.path(), "origin", "v1")
            .await
            .unwrap();
        assert_eq!(
            remote.git(&["rev-parse", "refs/tags/v1"]),
            local.git(&["rev-parse", "refs/tags/v1"])
        );
        do_delete_remote_tag(&ops, "t2", local.path(), "origin", "v1")
            .await
            .unwrap();
        assert!(!has_ref(&remote, "refs/tags/v1"));
        assert!(has_ref(&local, "refs/tags/v1"));
    }

    #[tokio::test]
    async fn rejected_non_fast_forward_push_reports_stderr() {
        let ops = OpRegistry::default();
        let (remote, local) = with_remote();
        let other = TestRepo::new();
        other.git(&["remote", "add", "origin", remote.path().to_str().unwrap()]);
        other.git(&["fetch", "-q", "origin"]);
        other.git(&["checkout", "-q", "-B", "main", "origin/main"]);
        let theirs = other.commit("theirs", &[("a.txt", "theirs")]);
        other.git(&["push", "-q", "origin", "main"]);
        local.commit("ours", &[("a.txt", "ours")]);

        let err = do_push_branch(&ops, "p1", local.path(), "origin", "main", false)
            .await
            .unwrap_err();
        assert_eq!(err.kind, GitErrorKind::Failed);
        assert!(err.message.contains("rejected"), "{}", err.message);
        assert_eq!(remote.git(&["rev-parse", "refs/heads/main"]), theirs);
        assert!(ops.is_empty());
    }

    #[tokio::test]
    async fn unknown_remote_and_bad_names_are_rejected() {
        let ops = OpRegistry::default();
        let (_remote, local) = with_remote();
        let kind = |r: Result<(), GitError>| r.unwrap_err().kind;
        assert_eq!(
            kind(do_push_branch(&ops, "a", local.path(), "nope", "main", false).await),
            GitErrorKind::InvalidName
        );
        assert_eq!(
            kind(do_push_branch(&ops, "b", local.path(), "--all", "main", false).await),
            GitErrorKind::InvalidName
        );
        assert_eq!(
            kind(do_push_branch(&ops, "c", local.path(), "origin", "+main", false).await),
            GitErrorKind::Failed
        );
        assert_eq!(
            kind(do_push_tag(&ops, "d", local.path(), "origin", "bad..tag").await),
            GitErrorKind::InvalidName
        );
        assert_eq!(
            kind(do_delete_remote_branch(&ops, "e", local.path(), "origin", "@{-1}").await),
            GitErrorKind::InvalidName
        );
        assert_eq!(
            kind(do_delete_remote_tag(&ops, "f", local.path(), "origin", "-x").await),
            GitErrorKind::InvalidName
        );
    }

    #[test]
    fn cancel_unknown_operation_is_a_no_op() {
        let ops = OpRegistry::default();
        ops.cancel("missing");
        assert!(ops.is_empty());
    }

    #[cfg(unix)]
    fn install_pre_push(repo: &TestRepo, body: &str) {
        use std::os::unix::fs::PermissionsExt;
        let hooks = repo.path().join(".git/hooks");
        std::fs::create_dir_all(&hooks).unwrap();
        let hook = hooks.join("pre-push");
        std::fs::write(&hook, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();
        // Overrides any global core.hooksPath of the machine running the tests.
        repo.git(&["config", "core.hooksPath", hooks.to_str().unwrap()]);
    }

    #[cfg(unix)]
    fn process_alive(pid: i32) -> bool {
        // SAFETY: signal 0 only checks that the process exists.
        unsafe { libc::kill(pid, 0) == 0 }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn cancel_kills_running_operation() {
        use std::sync::Arc;
        use std::time::Duration;

        let ops = Arc::new(OpRegistry::default());
        let (remote, local) = with_remote();
        local.git(&["checkout", "-q", "-b", "feat"]);
        local.commit("feat", &[("b.txt", "b")]);
        let pid_file = local.path().join("hook.pid");
        let tmp = local.path().join("hook.pid.tmp");
        install_pre_push(
            &local,
            &format!(
                "echo $$ > '{}' && mv '{}' '{}'\nexec sleep 30",
                tmp.display(),
                tmp.display(),
                pid_file.display()
            ),
        );

        let task = tokio::spawn({
            let ops = Arc::clone(&ops);
            let path = local.path().to_path_buf();
            async move { do_push_branch(&ops, "slow", &path, "origin", "feat", false).await }
        });

        // Wait until the hook is really running before cancelling.
        let mut pid = None;
        for _ in 0..500 {
            if let Ok(text) = std::fs::read_to_string(&pid_file) {
                pid = text.trim().parse::<i32>().ok();
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        let pid = pid.expect("pre-push hook never started");
        assert!(process_alive(pid));

        ops.cancel("slow");
        let result = tokio::time::timeout(Duration::from_secs(2), task)
            .await
            .expect("cancel took more than 2 s")
            .unwrap();
        assert_eq!(result.unwrap_err().kind, GitErrorKind::Cancelled);
        assert!(ops.is_empty());

        // The orphaned sleep is a zombie until init reaps it.
        let mut alive = true;
        for _ in 0..100 {
            alive = process_alive(pid);
            if !alive {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert!(!alive, "hook process {pid} survived the cancel");
        assert!(!has_ref(&remote, "refs/heads/feat"));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn no_timeout_is_applied() {
        let ops = OpRegistry::default();
        let (remote, local) = with_remote();
        local.git(&["checkout", "-q", "-b", "feat"]);
        let hash = local.commit("feat", &[("b.txt", "b")]);
        install_pre_push(&local, "sleep 3");
        do_push_branch(&ops, "slow", local.path(), "origin", "feat", false)
            .await
            .unwrap();
        assert_eq!(remote.git(&["rev-parse", "refs/heads/feat"]), hash);
    }
}
