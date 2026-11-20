//! Watches the open repository and emits a debounced `repo-changed` event.
use crate::git::error::{GitError, GitErrorKind};
use crate::git::runner::run_git;
use crate::repos::resolve_repo;
use notify_debouncer_mini::notify::{self, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::ffi::OsStr;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

const DEBOUNCE: Duration = Duration::from_millis(300);

/// Dropping it stops the watch and its debounce thread.
pub struct RepoWatcher {
    _watcher: Arc<Mutex<RecommendedWatcher>>,
}

/// Directories that are never watched: dependency and build output (the
/// likeliest way to run out of inotify watches) and hidden ones, `.git` included.
fn is_skipped_dir(name: &OsStr) -> bool {
    let Some(name) = name.to_str() else {
        return false;
    };
    name.starts_with('.')
        || matches!(
            name,
            "node_modules" | "target" | "dist" | "build" | "vendor"
        )
}

/// `root` and its subdirectories to watch (each non-recursively, see
/// `PER_DIRECTORY`), skipping
/// `is_skipped_dir` ones and not following symlinks.
pub fn watch_dirs(root: &Path) -> Vec<PathBuf> {
    let mut dirs = vec![];
    let mut todo = vec![root.to_path_buf()];
    while let Some(dir) = todo.pop() {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                if entry.file_type().is_ok_and(|t| t.is_dir())
                    && !is_skipped_dir(&entry.file_name())
                {
                    todo.push(entry.path());
                }
            }
        }
        dirs.push(dir);
    }
    dirs
}

/// The active watcher, and the generation of the last `watch_repo` or
/// `unwatch_repo` applied. Commands run on a thread pool, so they may arrive in
/// any order: the front numbers them and a call older than the last one applied
/// is ignored.
#[derive(Default)]
pub struct WatcherState(Mutex<Slot>);

#[derive(Default)]
struct Slot {
    generation: u64,
    watcher: Option<RepoWatcher>,
}

impl Slot {
    /// Replaces the watcher with `start()`'s, unless a newer call was applied.
    fn watch(
        &mut self,
        generation: u64,
        start: impl FnOnce() -> Result<RepoWatcher, GitError>,
    ) -> Result<(), GitError> {
        if generation < self.generation {
            return Ok(());
        }
        self.generation = generation;
        // Drop the previous watcher first so it cannot emit for the old repository.
        self.watcher.take();
        self.watcher = Some(start()?);
        Ok(())
    }

    fn unwatch(&mut self, generation: u64) {
        if generation >= self.generation {
            self.generation = generation;
            self.watcher.take();
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepoChanged {
    repo: String,
    /// False when only the work tree or the index changed: the commit list and
    /// refs are unchanged, so the front only needs to re-read the status.
    history: bool,
}

/// One relevant event, as passed from the notify callback to the debounce thread.
struct Change {
    new_dirs: Vec<PathBuf>,
    history: bool,
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
    // Changes inside directories that are not watched (dependency and build
    // output churn during installs and builds) do not count. The last
    // component may be a hidden file such as `.gitignore`, which does.
    let mut parts: Vec<_> = rel.components().collect();
    let last = parts.pop();
    let in_skipped = parts
        .iter()
        .any(|c| matches!(c, Component::Normal(n) if is_skipped_dir(n)));
    let is_skipped_itself =
        matches!(last, Some(Component::Normal(n)) if is_skipped_dir(n)) && path.is_dir();
    !(in_skipped || is_skipped_itself)
}

/// Whether a change at `path` can alter the refs or the commit list.
fn touches_history(path: &Path, git_dir: &Path) -> bool {
    path.strip_prefix(git_dir).is_ok_and(|rel| {
        matches!(
            rel.components().next(),
            Some(Component::Normal(first)) if matches!(first.to_str(), Some("HEAD" | "packed-refs" | "refs"))
        )
    })
}

/// Whether `dir` (a new directory seen in an event) belongs to the watched set.
fn is_watchable_dir(dir: &Path, workdir: &Path) -> bool {
    dir.strip_prefix(workdir).is_ok_and(|rel| {
        !rel.components()
            .any(|c| matches!(c, Component::Normal(n) if is_skipped_dir(n)))
    })
}

fn resolve_dirs(repo: &Path) -> Result<(PathBuf, PathBuf), GitError> {
    let workdir = repo.canonicalize().map_err(failed)?;
    let out = run_git(&workdir, &["rev-parse", "--absolute-git-dir"])?;
    let git_dir = PathBuf::from(out.trim()).canonicalize().map_err(failed)?;
    Ok((workdir, git_dir))
}

/// Whether the work tree is watched directory by directory. inotify (Linux)
/// is not recursive: notify would add a watch per directory anyway, including
/// dependency and build output, which is the likeliest way to run out of
/// watches. FSEvents (macOS) is natively recursive and restarts its stream on
/// every added path; on Windows a handle per directory can block renaming or
/// removing its ancestors. Both get a single recursive watch, and
/// `is_relevant` filters what it reports.
const PER_DIRECTORY: bool = cfg!(target_os = "linux");

/// Starts watching `dir`; `on_change` runs (on its own thread) once per burst
/// of relevant changes, `DEBOUNCE` after the last one, with whether any of them
/// touched the history (see `touches_history`). Dropping the result stops the
/// watch.
///
/// The debounce is done here rather than by `notify-debouncer-mini`, which
/// reports read accesses (git opening `.git/index` or a ref) as changes and
/// would make every refresh trigger the next one.
pub fn start(
    dir: &Path,
    on_change: impl Fn(bool) + Send + 'static,
) -> Result<RepoWatcher, GitError> {
    start_with(dir, PER_DIRECTORY, on_change)
}

/// `start` with an explicit strategy. Per directory, the work tree is walked
/// (see `watch_dirs`) and directories created later are added as they appear.
fn start_with(
    dir: &Path,
    per_directory: bool,
    on_change: impl Fn(bool) + Send + 'static,
) -> Result<RepoWatcher, GitError> {
    let (workdir, git_dir) = resolve_dirs(dir)?;
    let (tx, rx) = mpsc::channel::<Change>();
    let (w, g) = (workdir.clone(), git_dir.clone());
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        if matches!(event.kind, EventKind::Access(_)) {
            return;
        }
        let relevant: Vec<_> = event
            .paths
            .iter()
            .filter(|p| is_relevant(p, &w, &g))
            .collect();
        if relevant.is_empty() {
            return;
        }
        let history = relevant.iter().any(|p| touches_history(p, &g));
        let new_dirs = if per_directory && matches!(event.kind, EventKind::Create(_)) {
            event
                .paths
                .iter()
                .filter(|p| p.is_dir() && is_watchable_dir(p, &w))
                .cloned()
                .collect()
        } else {
            vec![]
        };
        let _ = tx.send(Change { new_dirs, history });
    })
    .map_err(failed)?;
    if per_directory {
        for d in watch_dirs(&workdir) {
            match watcher.watch(&d, RecursiveMode::NonRecursive) {
                Ok(()) => {}
                // Only the root matters to everything else: a directory that is
                // unreadable or gone since the walk just goes unwatched.
                Err(e) if d != workdir && !matches!(e.kind, notify::ErrorKind::MaxFilesWatch) => {}
                Err(e) => return Err(failed(e)),
            }
        }
    } else {
        watcher
            .watch(&workdir, RecursiveMode::Recursive)
            .map_err(failed)?;
    }
    // HEAD, index and packed-refs sit in the git dir; refs/ holds the rest.
    // A worktree's or a `.git` file's real git dir may lie outside the tree.
    watcher
        .watch(&git_dir, RecursiveMode::NonRecursive)
        .map_err(failed)?;
    watcher
        .watch(&git_dir.join("refs"), RecursiveMode::Recursive)
        .map_err(failed)?;

    let watcher = Arc::new(Mutex::new(watcher));
    let weak = Arc::downgrade(&watcher);
    // Ends when the watcher (and with it `tx`) is dropped.
    std::thread::spawn(move || {
        let add_dirs = |dirs: Vec<PathBuf>| {
            let Some(watcher) = weak.upgrade() else {
                return;
            };
            let Ok(mut watcher) = watcher.lock() else {
                return;
            };
            for d in dirs {
                for d in watch_dirs(&d) {
                    // Best effort: there is nobody to report to from here.
                    let _ = watcher.watch(&d, RecursiveMode::NonRecursive);
                }
            }
        };
        while let Ok(first) = rx.recv() {
            let mut history = first.history;
            add_dirs(first.new_dirs);
            loop {
                match rx.recv_timeout(DEBOUNCE) {
                    Ok(change) => {
                        history |= change.history;
                        add_dirs(change.new_dirs);
                    }
                    Err(RecvTimeoutError::Timeout) => break,
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
            on_change(history);
        }
    });
    Ok(RepoWatcher { _watcher: watcher })
}

#[tauri::command(async)]
pub fn watch_repo(
    app: AppHandle,
    state: State<WatcherState>,
    repo: String,
    generation: u64,
) -> Result<(), GitError> {
    let dir = resolve_repo(&app, &repo)?;
    // Held while the watcher starts, so calls are applied one at a time.
    let mut slot = state.0.lock().map_err(failed)?;
    let emitter = app.clone();
    slot.watch(generation, || {
        start(&dir, move |history| {
            let payload = RepoChanged {
                repo: repo.clone(),
                history,
            };
            let _ = emitter.emit("repo-changed", payload);
        })
    })
}

#[tauri::command(async)]
pub fn unwatch_repo(state: State<WatcherState>, generation: u64) -> Result<(), GitError> {
    state.0.lock().map_err(failed)?.unwatch(generation);
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

    fn watch(repo: &TestRepo) -> (RepoWatcher, Receiver<bool>) {
        let (tx, rx) = channel();
        let w = start(repo.path(), move |history| {
            let _ = tx.send(history);
        })
        .expect("start");
        (w, rx)
    }

    fn quiet(rx: &Receiver<bool>, d: Duration) -> bool {
        rx.recv_timeout(d).is_err()
    }

    /// Drains events until none arrives for a second. FSEvents (macOS) can
    /// deliver changes made just before the watch started, after it started.
    fn settle(rx: &Receiver<bool>) {
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        while !quiet(rx, Duration::from_secs(1)) {
            assert!(std::time::Instant::now() < deadline, "events never settled");
        }
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

    #[test]
    fn reports_whether_the_history_changed() {
        let repo = TestRepo::new();
        let hash = repo.commit("c1", &[("a.txt", "a")]);
        let (_w, rx) = watch(&repo);
        fs::write(repo.path().join("a.txt"), "changed").unwrap();
        assert_eq!(rx.recv_timeout(Duration::from_secs(3)), Ok(false));
        assert!(quiet(&rx, Duration::from_millis(600)));
        fs::write(repo.path().join(".git/index"), "x").unwrap();
        assert_eq!(rx.recv_timeout(Duration::from_secs(3)), Ok(false));
        assert!(quiet(&rx, Duration::from_millis(600)));
        // A burst mixing both kinds reports a history change.
        fs::write(repo.path().join("b.txt"), "b").unwrap();
        fs::write(
            repo.path().join(".git/refs/heads/other"),
            format!("{hash}\n"),
        )
        .unwrap();
        assert_eq!(rx.recv_timeout(Duration::from_secs(3)), Ok(true));
    }

    #[test]
    fn watch_dirs_skips_dependency_build_and_hidden_directories() {
        let repo = TestRepo::new();
        let root = repo.path();
        for d in [
            "src/deep",
            "node_modules/a/b",
            "target/debug",
            "dist",
            ".cache/x",
        ] {
            fs::create_dir_all(root.join(d)).unwrap();
        }
        let mut dirs: Vec<_> = watch_dirs(root)
            .into_iter()
            .map(|d| d.strip_prefix(root).unwrap().to_path_buf())
            .collect();
        dirs.sort();
        assert_eq!(dirs, [PathBuf::new(), "src".into(), "src/deep".into()]);
    }

    #[test]
    fn a_file_in_a_new_directory_triggers_an_event() {
        let repo = TestRepo::new();
        repo.commit("c1", &[("a.txt", "a")]);
        let (_w, rx) = watch(&repo);
        fs::create_dir_all(repo.path().join("new/sub")).unwrap();
        assert!(
            rx.recv_timeout(Duration::from_secs(3)).is_ok(),
            "no dir event"
        );
        assert!(quiet(&rx, Duration::from_millis(600)));
        fs::write(repo.path().join("new/sub/f.txt"), "x").unwrap();
        assert!(
            rx.recv_timeout(Duration::from_secs(3)).is_ok(),
            "no file event"
        );
    }

    #[test]
    fn a_new_directory_under_node_modules_is_not_watched() {
        let repo = TestRepo::new();
        fs::create_dir_all(repo.path().join("node_modules")).unwrap();
        let (_w, rx) = watch(&repo);
        fs::create_dir_all(repo.path().join("node_modules/p/q")).unwrap();
        fs::write(repo.path().join("node_modules/p/q/f.js"), "x").unwrap();
        assert!(quiet(&rx, Duration::from_secs(1)));
    }

    #[test]
    fn refs_below_the_git_dir_still_trigger_events() {
        let repo = TestRepo::new();
        let hash = repo.commit("c1", &[("a.txt", "a")]);
        let (_w, rx) = watch(&repo);
        fs::create_dir_all(repo.path().join(".git/refs/heads/feat")).unwrap();
        fs::write(
            repo.path().join(".git/refs/heads/feat/x"),
            format!("{hash}\n"),
        )
        .unwrap();
        assert!(rx.recv_timeout(Duration::from_secs(3)).is_ok());
        fs::write(repo.path().join(".git/HEAD"), "ref: refs/heads/feat/x\n").unwrap();
        assert!(rx.recv_timeout(Duration::from_secs(3)).is_ok());
    }

    #[test]
    fn a_stale_watch_or_unwatch_is_ignored() {
        let repo = TestRepo::new();
        let mut slot = Slot::default();
        // The front sent watch(1), unwatch(2), watch(3); they arrive reversed.
        slot.watch(3, || start(repo.path(), |_| {})).unwrap();
        slot.unwatch(2);
        assert!(slot.watcher.is_some(), "stale unwatch dropped the watcher");
        slot.watch(1, || panic!("stale watch must not start"))
            .unwrap();
        slot.unwatch(4);
        assert!(slot.watcher.is_none());
        slot.watch(2, || panic!("stale watch must not start"))
            .unwrap();
        assert!(slot.watcher.is_none());
    }

    #[cfg(unix)]
    #[test]
    fn an_unreadable_subdirectory_does_not_stop_the_watch() {
        use std::os::unix::fs::PermissionsExt;
        /// Restores permissions so the temp dir can be removed, even on panic.
        struct Restore(PathBuf);
        impl Drop for Restore {
            fn drop(&mut self) {
                let _ = fs::set_permissions(&self.0, fs::Permissions::from_mode(0o755));
            }
        }
        let repo = TestRepo::new();
        let locked = repo.path().join("locked");
        fs::create_dir(&locked).unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
        let _restore = Restore(locked);
        let (_w, rx) = watch(&repo);
        fs::write(repo.path().join("other.txt"), "x").unwrap();
        assert!(rx.recv_timeout(Duration::from_secs(3)).is_ok(), "no event");
    }

    #[test]
    fn a_recreated_skipped_directory_is_not_watched() {
        let repo = TestRepo::new();
        let (_w, rx) = watch(&repo);
        fs::create_dir_all(repo.path().join("src/dist")).unwrap();
        assert!(rx.recv_timeout(Duration::from_secs(3)).is_ok());
        fs::write(repo.path().join("src/dist/out.js"), "x").unwrap();
        assert!(quiet(&rx, Duration::from_secs(1)));
    }

    /// The single recursive watch used outside Linux, exercised here too.
    #[test]
    fn a_recursive_watch_reports_tree_changes_and_filters_the_rest() {
        let repo = TestRepo::new();
        let hash = repo.commit("c1", &[("a.txt", "a")]);
        fs::create_dir_all(repo.path().join("src/deep")).unwrap();
        fs::create_dir_all(repo.path().join("node_modules/p")).unwrap();
        let (tx, rx) = channel();
        let _w = start_with(repo.path(), false, move |history| {
            let _ = tx.send(history);
        })
        .expect("start");
        settle(&rx);
        fs::write(repo.path().join("node_modules/p/i.js"), "x").unwrap();
        fs::write(repo.path().join(".git/objects/zz-ignored"), "x").unwrap();
        assert!(quiet(&rx, Duration::from_secs(1)), "ignored change emitted");
        fs::write(repo.path().join("src/deep/f.txt"), "x").unwrap();
        assert!(
            rx.recv_timeout(Duration::from_secs(3)).is_ok(),
            "no tree event"
        );
        assert!(quiet(&rx, Duration::from_millis(600)));
        fs::write(
            repo.path().join(".git/refs/heads/other"),
            format!("{hash}\n"),
        )
        .unwrap();
        assert!(
            rx.recv_timeout(Duration::from_secs(3)).is_ok(),
            "no ref event"
        );
    }
}
