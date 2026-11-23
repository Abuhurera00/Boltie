//! Small OS helpers: finding programs, running shell commands, spawning apps.

use std::env;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::io::AsyncReadExt;
use tokio::process::Command;

/// Output is clipped to this many bytes before it goes back to the model.
pub const MAX_OUTPUT_BYTES: usize = 8 * 1024;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// A `Command` that won't flash a console window on Windows.
pub fn command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.kill_on_drop(true);
    cmd
}

/// Like `which`. On Windows it also tries each PATHEXT extension, because
/// tools installed through npm (`code`, `claude`) are often `.cmd` shims.
pub fn which(program: &str) -> Option<PathBuf> {
    let candidate = Path::new(program);
    if candidate.components().count() > 1 {
        return candidate.is_file().then(|| candidate.to_path_buf());
    }

    let exts: Vec<String> = if cfg!(windows) {
        env::var("PATHEXT")
            .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into())
            .split(';')
            .filter(|e| !e.is_empty())
            .map(|e| e.to_lowercase())
            .collect()
    } else {
        vec![String::new()]
    };

    let path = env::var_os("PATH")?;
    for dir in env::split_paths(&path) {
        if cfg!(windows) && Path::new(program).extension().is_some() {
            let full = dir.join(program);
            if full.is_file() {
                return Some(full);
            }
        }
        for ext in &exts {
            let full = dir.join(format!("{program}{ext}"));
            if full.is_file() {
                return Some(full);
            }
        }
    }
    None
}

/// The shell the model should write commands for.
#[derive(Debug, Clone)]
pub struct Shell {
    pub program: PathBuf,
    pub args: Vec<&'static str>,
    pub name: &'static str,
}

impl Shell {
    pub fn detect() -> Self {
        if cfg!(windows) {
            if let Some(pwsh) = which("pwsh") {
                return Shell { program: pwsh, args: vec!["-NoProfile", "-NonInteractive", "-Command"], name: "PowerShell 7" };
            }
            Shell {
                program: PathBuf::from("powershell"),
                args: vec!["-NoProfile", "-NonInteractive", "-Command"],
                name: "Windows PowerShell 5.1",
            }
        } else {
            let sh = env::var("SHELL").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("/bin/sh"));
            Shell { program: sh, args: vec!["-lc"], name: "POSIX shell" }
        }
    }
}

#[derive(Debug, Clone)]
pub struct CommandOutput {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
}

impl CommandOutput {
    pub fn ok(&self) -> bool {
        !self.timed_out && self.code == Some(0)
    }

    /// Compact text for the model: exit code plus clipped output.
    pub fn for_model(&self) -> String {
        let mut text = match (self.timed_out, self.code) {
            (true, _) => "timed out\n".to_string(),
            (false, Some(code)) => format!("exit code {code}\n"),
            (false, None) => "terminated by signal\n".to_string(),
        };
        if !self.stdout.trim().is_empty() {
            text.push_str("stdout:\n");
            text.push_str(self.stdout.trim_end());
            text.push('\n');
        }
        if !self.stderr.trim().is_empty() {
            text.push_str("stderr:\n");
            text.push_str(self.stderr.trim_end());
        }
        text
    }
}

/// Run a command line through the user's shell and capture its output.
pub async fn run_shell(shell: &Shell, line: &str, cwd: Option<&Path>, timeout: Duration) -> std::io::Result<CommandOutput> {
    let mut cmd = command(&shell.program);
    cmd.args(&shell.args).arg(line);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    run(cmd, timeout).await
}

pub async fn run(mut cmd: Command, timeout: Duration) -> std::io::Result<CommandOutput> {
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn()?;
    let mut stdout = child.stdout.take().expect("piped stdout");
    let mut stderr = child.stderr.take().expect("piped stderr");

    let collect = async {
        let mut out = Vec::new();
        let mut err = Vec::new();
        let (a, b, status) = tokio::join!(stdout.read_to_end(&mut out), stderr.read_to_end(&mut err), child.wait());
        a?;
        b?;
        Ok::<_, std::io::Error>((status?, out, err))
    };

    match tokio::time::timeout(timeout, collect).await {
        Ok(result) => {
            let (status, out, err) = result?;
            Ok(CommandOutput { code: status.code(), stdout: clip(&out), stderr: clip(&err), timed_out: false })
        }
        // Dropping `collect` drops `child`, and kill_on_drop ends the process.
        Err(_) => Ok(CommandOutput { code: None, stdout: String::new(), stderr: String::new(), timed_out: true }),
    }
}

/// Start a GUI program and don't wait for it.
pub fn spawn_detached(program: &Path, args: &[&str], cwd: Option<&Path>) -> std::io::Result<()> {
    let mut cmd = std::process::Command::new(program);
    cmd.args(args).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn().map(|_| ())
}

/// Keep the head and tail of long output; the middle is rarely what matters.
pub fn clip(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    if text.len() <= MAX_OUTPUT_BYTES {
        return text.into_owned();
    }
    let half = MAX_OUTPUT_BYTES / 2;
    let head_end = floor_char_boundary(&text, half);
    let tail_start = floor_char_boundary(&text, text.len() - half);
    format!(
        "{}\n... [{} bytes cut] ...\n{}",
        &text[..head_end],
        tail_start - head_end,
        &text[tail_start..]
    )
}

fn floor_char_boundary(s: &str, mut idx: usize) -> usize {
    while idx > 0 && !s.is_char_boundary(idx) {
        idx -= 1;
    }
    idx
}

pub fn os_name() -> &'static str {
    match env::consts::OS {
        "windows" => "Windows",
        "macos" => "macOS",
        "linux" => "Linux",
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clip_keeps_short_output() {
        assert_eq!(clip(b"hello"), "hello");
    }

    #[test]
    fn clip_cuts_the_middle() {
        let long = "a".repeat(MAX_OUTPUT_BYTES) + &"b".repeat(MAX_OUTPUT_BYTES);
        let clipped = clip(long.as_bytes());
        assert!(clipped.starts_with('a'));
        assert!(clipped.ends_with('b'));
        assert!(clipped.contains("bytes cut"));
    }

    #[test]
    fn clip_respects_utf8() {
        let long = "é".repeat(MAX_OUTPUT_BYTES);
        let _ = clip(long.as_bytes());
    }

    #[tokio::test]
    async fn runs_a_shell_command() {
        let out = run_shell(&Shell::detect(), "echo boltie", None, Duration::from_secs(30)).await.unwrap();
        assert!(out.ok(), "{out:?}");
        assert!(out.stdout.contains("boltie"));
    }
}
