use super::error::{GitError, GitErrorKind};
use super::runner::{git_command, spawn_error};
use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use tauri::State;
use tokio::sync::Notify;

/// After Cancel, how long git gets to remove its lock files before the whole
/// process tree is killed outright.
const CANCEL_GRACE: Duration = Duration::from_secs(1);

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
    #[allow(unused_mut)]
    let mut std_cmd = git_command(repo, args);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // Its own group, so that killing the group reaches every descendant.
        std_cmd.process_group(0);
    }
    let mut cmd = tokio::process::Command::from(std_cmd);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let child = cmd.spawn().map_err(spawn_error)?;
    let pid = child.id();
    let output = child.wait_with_output();
    tokio::pin!(output);

    tokio::select! {
        // Polling the wait first means the cancel branch only runs while the
        // operation is unfinished, so git's group id still belongs to it.
        biased;
        result = &mut output => {
            let output = result.map_err(|e| GitError::new(GitErrorKind::Failed, e.to_string()))?;
            if output.status.success() {
                Ok(String::from_utf8_lossy(&output.stdout).into_owned())
            } else {
                Err(GitError::new(
                    GitErrorKind::Failed,
                    String::from_utf8_lossy(&output.stderr).into_owned(),
                ))
            }
        }
        () = guard.signal.notified() => {
            if let Some(pid) = pid {
                kill_tree(pid, false).await;
                if tokio::time::timeout(CANCEL_GRACE, &mut output).await.is_err() {
                    kill_tree(pid, true).await;
                }
            }
            Err(GitError::new(GitErrorKind::Cancelled, op_id))
        }
    }
}

/// SIGTERM first lets git delete its lock files; `force` sends SIGKILL.
#[cfg(unix)]
async fn kill_tree(pid: u32, force: bool) {
    let signal = if force { libc::SIGKILL } else { libc::SIGTERM };
    // SAFETY: killpg only sends a signal. git leads its own group (see
    // `process_group(0)`), so the group id is git's pid.
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
