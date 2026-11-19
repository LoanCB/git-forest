//! Answers ssh and git prompts (key passphrase, password, host key) from the
//! app instead of a terminal nobody sees.
//!
//! git and ssh get `SSH_ASKPASS`/`GIT_ASKPASS` pointing at this executable.
//! Started that way it does not open a window: it forwards the prompt to the
//! running app over a loopback connection guarded by a random token, prints
//! the answer and exits. The app shows the prompt and sends the answer back.

use crate::git::error::{GitError, GitErrorKind};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{self, BufRead, BufReader, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use tauri::{AppHandle, Emitter};

const ENV_PORT: &str = "GIT_FOREST_ASKPASS_PORT";
const ENV_TOKEN: &str = "GIT_FOREST_ASKPASS_TOKEN";

/// How ssh expects the answer: text, or just a yes/no through the exit code
/// (`SSH_ASKPASS_PROMPT=confirm`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PromptKind {
    Text,
    Confirm,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptRequest {
    pub id: u64,
    pub prompt: String,
    pub kind: PromptKind,
}

#[derive(Serialize, Deserialize)]
struct Ask {
    token: String,
    prompt: String,
    kind: PromptKind,
}

#[derive(Serialize, Deserialize)]
struct Reply {
    answer: Option<String>,
}

type Pending = HashMap<u64, mpsc::Sender<Option<String>>>;

pub struct Server {
    port: u16,
    token: String,
    next_id: AtomicU64,
    pending: Mutex<Pending>,
}

impl Server {
    /// Listens on a loopback port; `notify` shows each prompt to the user.
    pub fn start(
        notify: impl Fn(PromptRequest) + Send + Sync + 'static,
    ) -> io::Result<Arc<Server>> {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
        let mut bytes = [0u8; 32];
        getrandom::fill(&mut bytes).map_err(|e| io::Error::other(e.to_string()))?;
        let server = Arc::new(Server {
            port: listener.local_addr()?.port(),
            token: bytes.iter().map(|b| format!("{b:02x}")).collect(),
            next_id: AtomicU64::new(1),
            pending: Mutex::new(HashMap::new()),
        });
        let notify = Arc::new(notify);
        let accepting = server.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let server = accepting.clone();
                let notify = notify.clone();
                std::thread::spawn(move || {
                    // A broken or foreign connection only costs its own thread.
                    let _ = server.serve(stream, &*notify);
                });
            }
        });
        Ok(server)
    }

    fn serve(&self, stream: TcpStream, notify: &dyn Fn(PromptRequest)) -> io::Result<()> {
        let mut line = String::new();
        BufReader::new(&stream).read_line(&mut line)?;
        let ask: Ask = serde_json::from_str(&line).map_err(io::Error::other)?;
        if ask.token != self.token {
            return Err(io::Error::other("bad askpass token"));
        }
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::channel();
        self.pending().insert(id, tx);
        notify(PromptRequest {
            id,
            prompt: ask.prompt,
            kind: ask.kind,
        });
        // Waits for the user; a dropped sender means no answer.
        let answer = rx.recv().unwrap_or(None);
        self.pending().remove(&id);
        let mut out = serde_json::to_string(&Reply { answer }).map_err(io::Error::other)?;
        out.push('\n');
        (&stream).write_all(out.as_bytes())
    }

    /// `None` cancels the prompt. Unknown ids (already answered) are ignored.
    pub fn answer(&self, id: u64, answer: Option<String>) {
        if let Some(tx) = self.pending().remove(&id) {
            let _ = tx.send(answer);
        }
    }

    fn pending(&self) -> MutexGuard<'_, Pending> {
        self.pending.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Points git and ssh at this executable for their prompts.
    pub fn configure(&self, cmd: &mut Command) {
        let Ok(exe) = std::env::current_exe() else {
            return;
        };
        cmd.env("SSH_ASKPASS", &exe)
            .env("GIT_ASKPASS", &exe)
            // OpenSSH 8.4+: use the helper even when a display or tty is around.
            .env("SSH_ASKPASS_REQUIRE", "force")
            .env(ENV_PORT, self.port.to_string())
            .env(ENV_TOKEN, &self.token);
        // Older OpenSSH only uses SSH_ASKPASS when DISPLAY is set.
        #[cfg(unix)]
        if std::env::var_os("DISPLAY").is_none() {
            cmd.env("DISPLAY", ":0");
        }
    }
}

static SERVER: OnceLock<Arc<Server>> = OnceLock::new();

/// Starts the server for the app; prompts reach the UI as `askpass-request`.
pub fn install(app: &AppHandle) {
    let emitter = app.clone();
    match Server::start(move |req| {
        let _ = emitter.emit("askpass-request", req);
    }) {
        Ok(server) => {
            let _ = SERVER.set(server);
        }
        // Without it, prompts fail as they would without a terminal.
        Err(e) => eprintln!("askpass server unavailable: {e}"),
    }
}

/// Adds the askpass environment to `cmd` once the app's server runs.
pub fn configure(cmd: &mut Command) {
    if let Some(server) = SERVER.get() {
        server.configure(cmd);
    }
}

#[tauri::command]
pub fn answer_askpass(id: u64, answer: Option<String>) {
    if let Some(server) = SERVER.get() {
        server.answer(id, answer);
    }
}

/// Sends `prompt` to the app and waits for the answer.
fn ask(port: u16, token: &str, prompt: &str, kind: PromptKind) -> io::Result<Option<String>> {
    let stream = TcpStream::connect((Ipv4Addr::LOCALHOST, port))?;
    let mut line = serde_json::to_string(&Ask {
        token: token.to_string(),
        prompt: prompt.to_string(),
        kind,
    })
    .map_err(io::Error::other)?;
    line.push('\n');
    (&stream).write_all(line.as_bytes())?;
    let mut reply = String::new();
    BufReader::new(&stream).read_line(&mut reply)?;
    let reply: Reply = serde_json::from_str(&reply).map_err(io::Error::other)?;
    Ok(reply.answer)
}

/// When started by git or ssh as their askpass program, answers the prompt
/// and returns the exit code; `None` for a normal start of the app.
pub fn helper_main() -> Option<i32> {
    let port: u16 = std::env::var(ENV_PORT).ok()?.parse().ok()?;
    let token = std::env::var(ENV_TOKEN).ok()?;
    let prompt = std::env::args().skip(1).collect::<Vec<_>>().join(" ");
    let kind = if std::env::var("SSH_ASKPASS_PROMPT").as_deref() == Ok("confirm") {
        PromptKind::Confirm
    } else {
        PromptKind::Text
    };
    Some(match ask(port, &token, &prompt, kind) {
        Ok(Some(answer)) => {
            if kind == PromptKind::Text {
                println!("{answer}");
            }
            0
        }
        _ => 1,
    })
}

/// Starts `cmd` with no controlling terminal, so it can only prompt through
/// the askpass helper.
pub fn detach_from_terminal(cmd: &mut Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // SAFETY: setsid is async-signal-safe and touches no parent state.
        unsafe {
            cmd.pre_exec(|| {
                if libc::setsid() == -1 {
                    return Err(io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }
    #[cfg(not(unix))]
    let _ = cmd;
}

/// Whether an ssh agent is reachable: `ssh-add -l` exits 2 when it is not.
#[tauri::command(async)]
pub fn ssh_agent_available() -> bool {
    Command::new("ssh-add")
        .arg("-l")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| matches!(s.code(), Some(0 | 1)))
        .unwrap_or(false)
}

/// Private keys in `~/.ssh`: files with a matching `.pub`. Only names are read.
#[tauri::command(async)]
pub fn list_ssh_keys() -> Vec<String> {
    let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(std::path::Path::new(&home).join(".ssh")) else {
        return Vec::new();
    };
    let mut keys: Vec<String> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|ext| ext == "pub"))
        .map(|p| p.with_extension(""))
        .filter(|p| p.is_file())
        .map(|p| p.display().to_string())
        .collect();
    keys.sort();
    keys
}

/// Adds `key` to the ssh agent; its passphrase is asked through the app.
#[tauri::command(async)]
pub fn load_ssh_key(key: String) -> Result<(), GitError> {
    let mut cmd = Command::new("ssh-add");
    cmd.arg("--").arg(&key).stdin(Stdio::null());
    configure(&mut cmd);
    detach_from_terminal(&mut cmd);
    let out = cmd
        .output()
        .map_err(|e| GitError::new(GitErrorKind::Failed, format!("ssh-add: {e}")))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(GitError::new(
            GitErrorKind::Failed,
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn server() -> (Arc<Server>, mpsc::Receiver<PromptRequest>) {
        let (tx, rx) = mpsc::channel();
        let tx = Mutex::new(tx);
        let server = Server::start(move |req| {
            let _ = tx.lock().unwrap().send(req);
        })
        .unwrap();
        (server, rx)
    }

    #[test]
    fn a_prompt_reaches_the_app_and_its_answer_comes_back() {
        let (server, prompts) = server();
        let (port, token) = (server.port, server.token.clone());
        let asker = std::thread::spawn(move || {
            ask(
                port,
                &token,
                "Enter passphrase for key 'k':",
                PromptKind::Text,
            )
        });
        let req = prompts.recv().unwrap();
        assert_eq!(req.prompt, "Enter passphrase for key 'k':");
        assert_eq!(req.kind, PromptKind::Text);
        server.answer(req.id, Some("s3cret".into()));
        assert_eq!(asker.join().unwrap().unwrap(), Some("s3cret".into()));
    }

    #[test]
    fn a_cancelled_prompt_answers_nothing() {
        let (server, prompts) = server();
        let (port, token) = (server.port, server.token.clone());
        let asker = std::thread::spawn(move || ask(port, &token, "Password:", PromptKind::Text));
        let req = prompts.recv().unwrap();
        server.answer(req.id, None);
        assert_eq!(asker.join().unwrap().unwrap(), None);
    }

    #[test]
    fn a_wrong_token_is_turned_away_without_reaching_the_app() {
        let (server, prompts) = server();
        assert!(ask(server.port, "nope", "Password:", PromptKind::Text).is_err());
        assert!(prompts
            .recv_timeout(std::time::Duration::from_millis(200))
            .is_err());
    }

    #[test]
    fn configure_points_git_and_ssh_at_this_executable() {
        let (server, _prompts) = server();
        let mut cmd = Command::new("git");
        server.configure(&mut cmd);
        let env: HashMap<String, Option<String>> = cmd
            .get_envs()
            .map(|(k, v)| {
                (
                    k.to_string_lossy().into_owned(),
                    v.map(|v| v.to_string_lossy().into_owned()),
                )
            })
            .collect();
        let exe = std::env::current_exe().unwrap().display().to_string();
        assert_eq!(env["SSH_ASKPASS"].as_deref(), Some(exe.as_str()));
        assert_eq!(env["GIT_ASKPASS"].as_deref(), Some(exe.as_str()));
        assert_eq!(env["SSH_ASKPASS_REQUIRE"].as_deref(), Some("force"));
        assert_eq!(env[ENV_TOKEN].as_deref(), Some(server.token.as_str()));
    }
}
