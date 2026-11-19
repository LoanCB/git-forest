use std::cell::Cell;
use std::path::Path;
use std::process::Command;
use tempfile::TempDir;

/// Throwaway repository independent of the user's git configuration.
pub struct TestRepo {
    dir: TempDir,
    clock: Cell<u64>,
}

impl TestRepo {
    pub fn new() -> Self {
        let repo = Self::init(&[]);
        repo.git(&["config", "user.name", "Test"]);
        repo.git(&["config", "user.email", "test@example.com"]);
        repo
    }

    /// Bare repository, used as a local remote.
    pub fn bare() -> Self {
        Self::init(&["--bare"])
    }

    fn init(extra: &[&str]) -> Self {
        let repo = Self {
            dir: tempfile::tempdir().expect("tempdir"),
            clock: Cell::new(1_700_000_000),
        };
        let mut args = vec!["init", "-q", "-b", "main"];
        args.extend_from_slice(extra);
        repo.git(&args);
        repo
    }

    pub fn path(&self) -> &Path {
        self.dir.path()
    }

    /// Runs git and returns trimmed stdout; panics on failure.
    pub fn git(&self, args: &[&str]) -> String {
        self.git_at(args, self.clock.get())
    }

    fn git_at(&self, args: &[&str], time: u64) -> String {
        let date = format!("{time} +0000");
        let output = Command::new("git")
            .args(["-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false"])
            .args(args)
            .current_dir(self.path())
            .env("GIT_CONFIG_GLOBAL", null_device())
            .env("GIT_CONFIG_SYSTEM", null_device())
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_AUTHOR_DATE", &date)
            .env("GIT_COMMITTER_DATE", &date)
            .env("LC_ALL", "C")
            .output()
            .expect("run git");
        assert!(
            output.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    /// Writes the files, commits them with a strictly increasing date and
    /// returns the commit hash.
    pub fn commit(&self, msg: &str, files: &[(&str, &str)]) -> String {
        for (name, content) in files {
            let path = self.path().join(name);
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).expect("mkdir");
            }
            std::fs::write(path, content).expect("write file");
        }
        self.git(&["add", "-A"]);
        let time = self.clock.get() + 60;
        self.clock.set(time);
        self.git_at(&["commit", "-q", "--allow-empty", "-m", msg], time);
        self.git(&["rev-parse", "HEAD"])
    }
}

fn null_device() -> &'static str {
    if cfg!(windows) {
        "NUL"
    } else {
        "/dev/null"
    }
}
