//! Runs the user's own `claude` CLI in headless mode.
//!
//! We never read Claude Code's credentials. We start the binary the user
//! installed, it uses its own login, and we read its `stream-json` output.
//!
//! Permissions: Claude Code runs with `--permission-prompts none`, so anything
//! not in the allow list is denied instead of hanging on a prompt nobody can
//! see. When the run ends with denials, Boltie shows each denied action on the
//! approval card. Forbidden commands are never offered.
//!
//! What happens after the user clicks Allow depends on the tool:
//! - shell commands: Boltie runs the exact command itself and resumes the
//!   session with the output. Adding it to `--allowedTools` is not enough,
//!   because Claude Code still refuses things like `$(...)` in headless mode
//!   no matter what the allow list says (seen on 2.1.x, Windows).
//! - other tools (Edit, Write, ...): the tool is added to the allow list and
//!   the session resumes.

use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};

use crate::event::{AgentEvent, ApprovalRequest, Host};
use crate::policy::{self, Risk};
use crate::sys::{self, Shell};
use crate::{Error, Result};

const RUN_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const MAX_PERMISSION_ROUNDS: usize = 3;
const APPROVED_COMMAND_TIMEOUT: Duration = Duration::from_secs(300);

const DESKTOP_PROMPT: &str = "You are running inside Boltie, a desktop assistant. The user spoke a short \
request out loud. Do it with as few steps as possible, then reply in one or two plain sentences \
suitable for a speech bubble. No markdown.";

pub struct Job<'a> {
    pub prompt: &'a str,
    pub cwd: &'a Path,
    pub allowed_tools: &'a [String],
}

/// Path to the `claude` binary, if installed.
pub fn detect() -> Option<std::path::PathBuf> {
    sys::which("claude")
}

#[derive(Debug, Default)]
struct RunResult {
    session_id: Option<String>,
    text: String,
    is_error: bool,
    denials: Vec<Denial>,
}

#[derive(Debug, Clone, PartialEq)]
struct Denial {
    tool: String,
    /// Set for shell tools: the exact command Boltie will run if approved.
    command: Option<String>,
    /// What the user sees.
    detail: String,
    risk: Risk,
}

/// Run a job to completion, asking the user about anything Claude Code was
/// not allowed to do. Returns the final text.
pub async fn run(cli: &Path, job: Job<'_>, host: &dyn Host) -> Result<String> {
    let mut allowed: Vec<String> = job.allowed_tools.to_vec();
    let mut result = run_once(cli, job.prompt, job.cwd, &allowed, None, host).await?;

    for _ in 0..MAX_PERMISSION_ROUNDS {
        if result.denials.is_empty() || result.session_id.is_none() {
            break;
        }
        let mut report = Vec::new();
        for denial in std::mem::take(&mut result.denials) {
            if denial.risk == Risk::Forbidden {
                host.emit(AgentEvent::Denied { summary: denial.detail.clone(), reason: "never allowed".into() });
                report.push(format!("- {}: blocked by Boltie, never allowed. Don't try it another way.", denial.detail));
                continue;
            }
            let request = ApprovalRequest {
                id: next_id(),
                title: format!("Claude Code wants to use {}", denial.tool),
                detail: denial.detail.clone(),
                risk: denial.risk,
                cwd: Some(job.cwd.display().to_string()),
            };
            if !host.approve(request).await {
                host.emit(AgentEvent::Denied { summary: denial.detail.clone(), reason: "you said no".into() });
                report.push(format!("- {}: the user said no. Don't retry it.", denial.detail));
                continue;
            }
            match &denial.command {
                Some(command) => {
                    let output = run_approved(&denial.tool, command, job.cwd, host).await;
                    report.push(format!("- the user approved `{command}` and Boltie ran it for you. Do not run it again. Result:
{output}"));
                }
                None => {
                    allowed.push(denial.tool.clone());
                    report.push(format!("- {}: the user approved it, you may use {} now.", denial.detail, denial.tool));
                }
            }
        }
        let follow_up = format!("Permission update from Boltie:
{}
Continue the task.", report.join("
"));
        result = run_once(cli, &follow_up, job.cwd, &allowed, result.session_id.as_deref(), host).await?;
    }

    if result.is_error {
        return Err(Error::ClaudeCli(if result.text.is_empty() { "run failed".into() } else { result.text }));
    }
    Ok(result.text)
}

/// Run a command the user just approved, in the shell Claude Code meant.
async fn run_approved(tool: &str, command: &str, cwd: &Path, host: &dyn Host) -> String {
    let shell = if tool == "Bash" {
        match sys::which("bash") {
            Some(bash) => Shell { program: bash, args: vec!["-lc"], name: "bash" },
            None => Shell::detect(),
        }
    } else {
        Shell::detect()
    };
    host.emit(AgentEvent::ToolStarted { name: "run_command".into(), summary: command.chars().take(80).collect() });
    let (ok, text) = match sys::run_shell(&shell, command, Some(cwd), APPROVED_COMMAND_TIMEOUT).await {
        Ok(out) => (out.ok(), out.for_model()),
        Err(e) => (false, format!("could not start {}: {e}", shell.name)),
    };
    host.emit(AgentEvent::ToolFinished { name: "run_command".into(), ok, preview: text.lines().next().unwrap_or_default().into() });
    text
}

async fn run_once(
    cli: &Path,
    prompt: &str,
    cwd: &Path,
    allowed: &[String],
    resume: Option<&str>,
    host: &dyn Host,
) -> Result<RunResult> {
    let mut cmd = sys::command(cli);
    cmd.args(["-p", "--output-format", "stream-json", "--verbose", "--permission-prompts", "none"])
        .args(["--append-system-prompt", DESKTOP_PROMPT]);
    if !allowed.is_empty() {
        cmd.arg("--allowedTools").arg(allowed.join(","));
    }
    if let Some(session) = resume {
        cmd.args(["--resume", session]);
    }
    // The prompt goes over stdin: arbitrary text through a `.cmd` shim on
    // Windows is an escaping problem we don't want.
    cmd.current_dir(cwd).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => Error::ClaudeCliMissing,
        _ => Error::Io(e),
    })?;

    let mut stdin = child.stdin.take().expect("piped stdin");
    stdin.write_all(prompt.as_bytes()).await?;
    drop(stdin);

    let stdout = child.stdout.take().expect("piped stdout");
    let mut stderr = child.stderr.take().expect("piped stderr");

    let read = async {
        let mut lines = BufReader::new(stdout).lines();
        let mut result = RunResult::default();
        let mut saw_result = false;
        while let Some(line) = lines.next_line().await? {
            let Ok(msg) = serde_json::from_str::<Value>(&line) else { continue };
            if handle_message(&msg, host, &mut result) {
                saw_result = true;
            }
        }
        let mut err = String::new();
        stderr.read_to_string(&mut err).await?;
        let status = child.wait().await?;
        Ok::<_, Error>((result, saw_result, status, err))
    };

    let (result, saw_result, status, stderr_text) = tokio::time::timeout(RUN_TIMEOUT, read)
        .await
        .map_err(|_| Error::ClaudeCli("timed out after 30 minutes".into()))??;

    if !saw_result {
        let detail = stderr_text.trim();
        return Err(Error::ClaudeCli(if detail.is_empty() {
            format!("exited with {status} and no result")
        } else {
            detail.lines().take(5).collect::<Vec<_>>().join("\n")
        }));
    }
    Ok(result)
}

/// Returns true for the final `result` message.
fn handle_message(msg: &Value, host: &dyn Host, result: &mut RunResult) -> bool {
    if let Some(id) = msg["session_id"].as_str() {
        result.session_id = Some(id.to_string());
    }
    match msg["type"].as_str() {
        Some("assistant") => {
            let blocks: Vec<&Value> = msg["message"]["content"].as_array().into_iter().flatten().collect();
            // Text right before a tool call is narration ("Starting Redis...") and is
            // shown live. A text-only message is the answer, which arrives again in
            // the result; showing it here would leak "I couldn't do it" lines that
            // go stale once the user approves the denied step.
            let narrates = blocks.iter().any(|b| b["type"] == "tool_use");
            for block in blocks {
                match block["type"].as_str() {
                    Some("text") if narrates => {
                        if let Some(text) = block["text"].as_str().filter(|t| !t.trim().is_empty()) {
                            host.emit(AgentEvent::Say { text: text.trim().to_string() });
                        }
                    }
                    Some("tool_use") => host.emit(AgentEvent::ToolStarted {
                        name: block["name"].as_str().unwrap_or("tool").to_string(),
                        summary: describe_input(&block["input"]),
                    }),
                    _ => {}
                }
            }
            false
        }
        Some("user") => {
            for block in msg["message"]["content"].as_array().into_iter().flatten() {
                if block["type"] == "tool_result" {
                    host.emit(AgentEvent::ToolFinished {
                        name: "claude".into(),
                        ok: !block["is_error"].as_bool().unwrap_or(false),
                        preview: String::new(),
                    });
                }
            }
            false
        }
        Some("result") => {
            result.text = msg["result"].as_str().unwrap_or_default().trim().to_string();
            result.is_error = msg["is_error"].as_bool().unwrap_or(false);
            result.denials = msg["permission_denials"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(parse_denial)
                .collect();
            result.denials.dedup();
            true
        }
        _ => false,
    }
}

fn parse_denial(value: &Value) -> Option<Denial> {
    let tool = value["tool_name"].as_str()?.to_string();
    let input = &value["tool_input"];
    // Shell tools: "Bash" everywhere, "PowerShell" on Windows.
    if let Some(command) = input["command"].as_str().filter(|_| is_shell_tool(&tool)) {
        let command = command.to_string();
        let risk = policy::assess_command(&command).risk.max(Risk::Change);
        return Some(Denial { command: Some(command.clone()), detail: command, tool, risk });
    }
    // Other tools are allowed as a whole for the rest of the session.
    let detail = describe_input(input);
    let detail = if detail.is_empty() { tool.clone() } else { detail };
    Some(Denial { command: None, detail, tool, risk: Risk::Change })
}

fn is_shell_tool(tool: &str) -> bool {
    matches!(tool, "Bash" | "PowerShell")
}

fn describe_input(input: &Value) -> String {
    for key in ["command", "file_path", "path", "pattern", "url", "description"] {
        if let Some(s) = input[key].as_str() {
            return s.chars().take(160).collect();
        }
    }
    String::new()
}

fn next_id() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(1_000_000);
    NEXT.fetch_add(1, Ordering::Relaxed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::Mutex;

    #[derive(Default)]
    struct Recorder(Mutex<Vec<AgentEvent>>);

    #[async_trait::async_trait]
    impl Host for Recorder {
        fn emit(&self, event: AgentEvent) {
            self.0.lock().unwrap().push(event);
        }
        async fn approve(&self, _: ApprovalRequest) -> bool {
            false
        }
    }

    #[test]
    fn reads_a_stream_json_transcript() {
        let host = Recorder::default();
        let mut result = RunResult::default();
        let lines = [
            json!({"type": "system", "subtype": "init", "session_id": "s1"}),
            json!({"type": "assistant", "message": {"content": [
                {"type": "text", "text": "Starting Redis."},
                {"type": "tool_use", "name": "Bash", "input": {"command": "docker run -d redis"}}
            ]}}),
            json!({"type": "user", "message": {"content": [{"type": "tool_result", "is_error": true}]}}),
            json!({"type": "result", "subtype": "success", "is_error": false, "result": "Couldn't start it.",
                   "session_id": "s1",
                   "permission_denials": [{"tool_name": "Bash", "tool_input": {"command": "docker run -d redis"}}]}),
        ];
        let mut done = false;
        for line in &lines {
            done |= handle_message(line, &host, &mut result);
        }
        assert!(done);
        assert_eq!(result.session_id.as_deref(), Some("s1"));
        assert_eq!(result.text, "Couldn't start it.");
        assert_eq!(result.denials.len(), 1);
        assert_eq!(result.denials[0].command.as_deref(), Some("docker run -d redis"));
        assert_eq!(result.denials[0].risk, Risk::Change);
        // narration + tool start + tool finish; the final answer is not echoed
        assert_eq!(host.0.lock().unwrap().len(), 3);
    }

    #[test]
    fn shell_denials_keep_the_exact_command() {
        let d = parse_denial(&json!({"tool_name": "PowerShell", "tool_input": {"command": "New-Item -ItemType Directory x"}})).unwrap();
        assert_eq!(d.command.as_deref(), Some("New-Item -ItemType Directory x"));
        assert_eq!(d.risk, Risk::Change);

        let d = parse_denial(&json!({"tool_name": "Write", "tool_input": {"file_path": "C:/a.txt"}})).unwrap();
        assert_eq!(d.command, None);
        assert_eq!(d.detail, "C:/a.txt");
    }

    #[test]
    fn forbidden_denials_stay_forbidden() {
        let d = parse_denial(&json!({"tool_name": "Bash", "tool_input": {"command": "rm -rf /"}})).unwrap();
        assert_eq!(d.risk, Risk::Forbidden);
    }
}
