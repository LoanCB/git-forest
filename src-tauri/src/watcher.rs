//! Watches the open repository and emits a debounced `repo-changed` event.
use crate::git::error::{GitError, GitErrorKind};
use crate::git::runner::run_git;
use crate::repos::resolve_repo;
use notify_debouncer_mini::notify::{self, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

const DEBOUNCE: Duration = Duration::from_millis(300);

pub type RepoWatcher = RecommendedWatcher;

/// The single active watcher; replaced by `watch_repo`, dropped by `unwatch_repo`.
#[derive(Default)]
pub struct WatcherState(Mutex<Option<RepoWatcher>>);

#[derive(Clone, Serialize)]
struct RepoChanged {
    repo: String,
}

fn failed(msg: impl ToString) -> GitError {
    GitError::new(GitErrorKind::Failed, msg.to_string())
}

/// Whether a change at `path` can alter what the view shows.
fn is_relevant(path: &Path, workdir: &Path, git_dir: &Path) -> bool {
    if path.extension().is_some_and(|e| e == "lock") {
        return false;
    }
    if let Ok(rel) = path.strip_prefix(git_dir) {
        let mut parts = rel.components();
        return match parts.next() {
            Some(Component::Normal(first)) => {
                matches!(
                    first.to_str(),
                    Some("HEAD" | "index" | "packed-refs" | "refs")
                )
            }
            _ => false,
        };
    }
    let Ok(rel) = path.strip_prefix(workdir) else {
        return false;
    };
    // `node_modules` and `target` churn during installs and builds.
    !rel.components().any(|c| {
        matches!(c, Component::Normal(n) if n == ".git" || n == "node_modules" || n == "target")
    })
}

fn resolve_dirs(repo: &Path) -> Result<(PathBuf, PathBuf), GitError> {
    let workdir = repo.canonicalize().map_err(failed)?;
    let out = run_git(&workdir, &["rev-parse", "--absolute-git-dir"])?;
    let git_dir = PathBuf::from(out.trim()).canonicalize().map_err(failed)?;
    Ok((workdir, git_dir))
}

/// Starts watching `dir`; `on_change` runs (on its own thread) once per burst
/// of relevant changes, `DEBOUNCE` after the last one. Dropping the result
/// stops the watch.
///
/// The debounce is done here rather than by `notify-debouncer-mini`, which
/// reports read accesses (git opening `.git/index` or a ref) as changes and
/// would make every refresh trigger the next one.
pub fn start(dir: &Path, on_change: impl Fn() + Send + 'static) -> Result<RepoWatcher, GitError> {
    let (workdir, git_dir) = resolve_dirs(dir)?;
    let (tx, rx) = mpsc::channel::<()>();
    let (w, g) = (workdir.clone(), git_dir.clone());
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        if matches!(event.kind, EventKind::Access(_)) {
            return;
        }
        if event.paths.iter().any(|p| is_relevant(p, &w, &g)) {
            let _ = tx.send(());
        }
    })
    .map_err(failed)?;
    watcher
        .watch(&workdir, RecursiveMode::Recursive)
        .map_err(failed)?;
    // A worktree's or a `.git` file's real git dir lies outside the tree.
    if !git_dir.starts_with(&workdir) {
        watcher
            .watch(&git_dir, RecursiveMode::Recursive)
            .map_err(failed)?;
    }
    // Ends when the watcher (and with it `tx`) is dropped.
    std::thread::spawn(move || {
        while rx.recv().is_ok() {
            loop {
                match rx.recv_timeout(DEBOUNCE) {
                    Ok(()) => {}
                    Err(RecvTimeoutError::Timeout) => break,
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
            on_change();
        }
    });
    Ok(watcher)
}

#[tauri::command(async)]
pub fn watch_repo(
    app: AppHandle,
    state: State<WatcherState>,
    repo: String,
) -> Result<(), GitError> {
    let dir = resolve_repo(&app, &repo)?;
    // Drop the previous watcher first so it cannot emit for the old repository.
    state.0.lock().map_err(failed)?.take();
    let emitter = app.clone();
    let payload = RepoChanged { repo };
    let watcher = start(&dir, move || {
        let _ = emitter.emit("repo-changed", payload.clone());
    })?;
    *state.0.lock().map_err(failed)? = Some(watcher);
    Ok(())
}

#[tauri::command(async)]
pub fn unwatch_repo(state: State<WatcherState>) -> Result<(), GitError> {
    state.0.lock().map_err(failed)?.take();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::read::{read_commits, read_refs, read_uncommitted};
    use crate::git::types::LogQuery;
    use crate::test_support::TestRepo;
    use std::fs;
    use std::sync::mpsc::{channel, Receiver};

    fn watch(repo: &TestRepo) -> (RepoWatcher, Receiver<()>) {
        let (tx, rx) = channel();
        let w = start(repo.path(), move || {
            let _ = tx.send(());
        })
        .expect("start");
        (w, rx)
    }

    fn quiet(rx: &Receiver<()>, d: Duration) -> bool {
        rx.recv_timeout(d).is_err()
    }

    #[test]
    fn emits_once_for_a_burst_of_ref_changes() {
        let repo = TestRepo::new();
        let hash = repo.commit("c1", &[("a.txt", "a")]);
        let (_w, rx) = watch(&repo);
        for i in 0..5 {
            fs::write(
                repo.path().join(format!(".git/refs/heads/b{i}")),
                format!("{hash}\n"),
            )
            .unwrap();
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(rx.recv_timeout(Duration::from_secs(3)).is_ok(), "no event");
        assert!(quiet(&rx, Duration::from_secs(1)), "more than one event");
    }

    #[test]
    fn ignores_object_and_lock_files() {
        let repo = TestRepo::new();
        repo.commit("c1", &[("a.txt", "a")]);
        let (_w, rx) = watch(&repo);
        let git = repo.path().join(".git");
        fs::write(git.join("objects/zz-ignored"), "x").unwrap();
        fs::write(git.join("index.lock"), "x").unwrap();
        fs::write(git.join("refs/heads/main.lock"), "x").unwrap();
        fs::create_dir_all(git.join("logs")).unwrap();
        fs::write(git.join("logs/ignored"), "x").unwrap();
        fs::write(git.join("COMMIT_EDITMSG"), "x").unwrap();
        fs::write(repo.path().join("work.txt.lock"), "x").unwrap();
        fs::create_dir_all(repo.path().join("node_modules/p")).unwrap();
        fs::write(repo.path().join("node_modules/p/i.js"), "x").unwrap();
        assert!(quiet(&rx, Duration::from_secs(1)), "ignored change emitted");
        // Control: a working tree change does count.
        fs::write(repo.path().join("work.txt"), "x").unwrap();
        assert!(rx.recv_timeout(Duration::from_secs(3)).is_ok(), "no event");
    }

    #[test]
    fn reading_the_repo_does_not_trigger_an_event() {
        let repo = TestRepo::new();
        repo.commit("c1", &[("a.txt", "a")]);
        fs::write(repo.path().join("b.txt"), "b").unwrap();
        let (_w, rx) = watch(&repo);
        read_refs(repo.path()).unwrap();
        let q = LogQuery {
            refs: None,
            include_remotes: true,
            skip: 0,
            limit: 50,
        };
        read_commits(repo.path(), &q).unwrap();
        read_uncommitted(repo.path()).unwrap();
        assert!(quiet(&rx, Duration::from_secs(1)), "a read emitted");
    }
}
