use super::error::{GitError, GitErrorKind};
use super::runner::{git_command, spawn_error};
use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use tauri::State;
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Child;
use tokio::sync::Notify;
use tokio::task::JoinHandle;

/// After Cancel, how long git gets to remove its lock files before the whole
/// process tree is killed outright.
const CANCEL_GRACE: Duration = Duration::from_secs(1);

/// Once git has exited, how long its output is still read: a detached
/// descendant (a hook's background job, an ssh control master) may keep the
/// pipes open indefinitely.
const PIPE_DRAIN: Duration = Duration::from_millis(500);

/// Running network operations by op id, so the UI's Cancel button can stop
/// them. Nothing else ever stops a running git: no timeout is applied.
#[derive(Default)]
pub struct OpRegistry {
    ops: Mutex<HashMap<String, Arc<Notify>>>,
}

impl OpRegistry {
    fn lock(&self) -> MutexGuard<'_, HashMap<String, Arc<Notify>>> {
        self.ops.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn register(&self, op_id: &str) -> Result<OpGuard<'_>, GitError> {
        let mut ops = self.lock();
        if ops.contains_key(op_id) {
            return Err(GitError::new(
                GitErrorKind::Failed,
                format!("operation {op_id} is already running"),
            ));
        }
        let signal = Arc::new(Notify::new());
        ops.insert(op_id.to_string(), Arc::clone(&signal));
        Ok(OpGuard {
            registry: self,
            op_id: op_id.to_string(),
            signal,
        })
    }

    /// Unknown or finished ids are ignored. A cancel that lands before git is
    /// spawned is kept by the `Notify` permit and honoured right after.
    pub fn cancel(&self, op_id: &str) {
        if let Some(signal) = self.lock().get(op_id) {
            signal.notify_one();
        }
    }

    #[cfg(test)]
    pub fn is_empty(&self) -> bool {
        self.lock().is_empty()
    }
}

/// Removes the operation from the registry however it ends.
struct OpGuard<'a> {
    registry: &'a OpRegistry,
    op_id: String,
    signal: Arc<Notify>,
}

impl Drop for OpGuard<'_> {
    fn drop(&mut self) {
        self.registry.lock().remove(&self.op_id);
    }
}

/// Reads a pipe in the background; what was read survives an abort.
struct Drain {
    buf: Arc<Mutex<Vec<u8>>>,
    task: JoinHandle<()>,
}

impl Drain {
    fn new<R: AsyncRead + Unpin + Send + 'static>(pipe: Option<R>) -> Self {
        let buf = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&buf);
        let task = tokio::spawn(async move {
            let Some(mut pipe) = pipe else { return };
            let mut chunk = [0u8; 8192];
            while let Ok(n @ 1..) = pipe.read(&mut chunk).await {
                sink.lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .extend_from_slice(&chunk[..n]);
            }
        });
        Self { buf, task }
    }

    fn text(&self) -> String {
        String::from_utf8_lossy(&self.buf.lock().unwrap_or_else(|e| e.into_inner())).into_owned()
    }
}

impl Drop for Drain {
    fn drop(&mut self) {
        self.task.abort();
    }
}

/// Runs git until it exits or `op_id` is cancelled, which kills git together
/// with its hooks, ssh and credential helpers.
pub async fn run_cancellable(
    registry: &OpRegistry,
    op_id: &str,
    repo: &Path,
    args: &[&str],
) -> Result<String, GitError> {
    if !repo.is_dir() {
        return Err(GitError::new(
            GitErrorKind::RepoNotFound,
            repo.display().to_string(),
        ));
    }
    let guard = registry.register(op_id)?;
    // git_command starts git in its own session, hence its own group, so that
    // killing the group reaches every descendant.
    let mut std_cmd = git_command(repo, args);
    // Network commands may need a passphrase or password: ask in the app.
    crate::askpass::configure(&mut std_cmd);
    let mut cmd = tokio::process::Command::from(std_cmd);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(spawn_error)?;
    let mut stdout = Drain::new(child.stdout.take());
    let mut stderr = Drain::new(child.stderr.take());

    let status = tokio::select! {
        biased;
        status = child.wait() => status.map_err(|e| GitError::new(GitErrorKind::Failed, e.to_string()))?,
        () = guard.signal.notified() => {
            terminate(&mut child, &mut stdout, &mut stderr).await;
            return Err(GitError::new(GitErrorKind::Cancelled, op_id));
        }
    };
    let _ = tokio::time::timeout(PIPE_DRAIN, async {
        let _ = (&mut stdout.task).await;
        let _ = (&mut stderr.task).await;
    })
    .await;
    if status.success() {
        Ok(stdout.text())
    } else {
        Err(GitError::new(GitErrorKind::Failed, stderr.text()))
    }
}

/// Kills git's process tree. Signals are only sent while git is unreaped:
/// until then its pid, and on unix its process group id, cannot be reused
/// (a zombie still holds them, as does the open process handle on Windows).
/// Nothing below polls the child, so it stays unreaped until it is dropped.
async fn terminate(child: &mut Child, stdout: &mut Drain, stderr: &mut Drain) {
    let Some(pid) = child.id() else { return };
    if !matches!(child.try_wait(), Ok(None)) {
        return;
    }
    kill_tree(pid, false).await;
    // The pipes close once everything holding them has died.
    let _ = tokio::time::timeout(CANCEL_GRACE, async {
        let _ = (&mut stdout.task).await;
        let _ = (&mut stderr.task).await;
    })
    .await;
    kill_tree(pid, true).await;
}

/// SIGTERM first lets git delete its lock files; `force` sends SIGKILL.
#[cfg(unix)]
async fn kill_tree(pid: u32, force: bool) {
    let signal = if force { libc::SIGKILL } else { libc::SIGTERM };
    // SAFETY: killpg only sends a signal. git leads its own group (see
    // `setsid` in git_command), so the group id is git's pid.
    unsafe {
        libc::killpg(pid as libc::pid_t, signal);
    }
}

#[cfg(windows)]
async fn kill_tree(pid: u32, _force: bool) {
    use std::os::windows::process::CommandExt;
    let mut cmd = std::process::Command::new("taskkill");
    cmd.args(["/T", "/F", "/PID", &pid.to_string()])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(0x0800_0000);
    let _ = tokio::process::Command::from(cmd).status().await;
}

#[tauri::command]
pub fn cancel_operation(ops: State<'_, OpRegistry>, op_id: String) -> Result<(), GitError> {
    ops.cancel(&op_id);
    Ok(())
}
