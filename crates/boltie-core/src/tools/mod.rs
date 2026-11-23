//! The things Boltie can actually do.
//!
//! Every call goes through the same three steps: parse the model's input into a
//! typed [`Call`], turn it into a [`Plan`] that says exactly what will run and
//! how risky it is, then execute. The agent sits between plan and execute and
//! asks the user when the plan says so.

mod apps;
mod docker;
mod folders;
mod scaffold;

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::config::Config;
use crate::event::Host;
use crate::policy::{self, Risk};
use crate::providers::claude_cli;
use crate::sys::{self, Shell};

/// Shared, read-only state the tools need.
pub struct ToolContext {
    pub config: Config,
    pub shell: Shell,
    pub claude_cli: Option<PathBuf>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Plan {
    pub risk: Risk,
    /// Why the policy picked that risk.
    pub reason: String,
    /// What the user sees on the approval card, e.g. "Run a Docker container".
    pub title: String,
    /// The exact command or target. Shown verbatim.
    pub detail: String,
    pub cwd: Option<PathBuf>,
}

#[derive(Debug, Clone)]
pub struct ToolOutput {
    pub content: String,
    pub is_error: bool,
}

impl ToolOutput {
    pub fn ok(content: impl Into<String>) -> Self {
        Self { content: content.into(), is_error: false }
    }
    pub fn err(content: impl Into<String>) -> Self {
        Self { content: content.into(), is_error: true }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunCommand {
    pub command: String,
    #[serde(default)]
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Delegate {
    pub task: String,
    pub cwd: String,
}

#[derive(Debug, Clone)]
pub enum Call {
    FindFolder(folders::FindFolder),
    OpenInEditor(apps::OpenInEditor),
    OpenApp(apps::OpenApp),
    RunCommand(RunCommand),
    DockerRun(docker::DockerRun),
    Scaffold(scaffold::Scaffold),
    DelegateToClaudeCode(Delegate),
}

impl Call {
    pub fn parse(name: &str, input: &Value) -> Result<Self, String> {
        fn typed<T: for<'de> Deserialize<'de>>(input: &Value) -> Result<T, String> {
            serde_json::from_value(input.clone()).map_err(|e| format!("invalid input: {e}"))
        }
        Ok(match name {
            "find_folder" => Call::FindFolder(typed(input)?),
            "open_in_editor" => Call::OpenInEditor(typed(input)?),
            "open_app" => Call::OpenApp(typed(input)?),
            "run_command" => Call::RunCommand(typed(input)?),
            "docker_run" => Call::DockerRun(typed(input)?),
            "scaffold_project" => Call::Scaffold(typed(input)?),
            "delegate_to_claude_code" => Call::DelegateToClaudeCode(typed(input)?),
            other => return Err(format!("unknown tool `{other}`")),
        })
    }

    pub fn name(&self) -> &'static str {
        match self {
            Call::FindFolder(_) => "find_folder",
            Call::OpenInEditor(_) => "open_in_editor",
            Call::OpenApp(_) => "open_app",
            Call::RunCommand(_) => "run_command",
            Call::DockerRun(_) => "docker_run",
            Call::Scaffold(_) => "scaffold_project",
            Call::DelegateToClaudeCode(_) => "delegate_to_claude_code",
        }
    }

    pub fn plan(&self, ctx: &ToolContext) -> Result<Plan, String> {
        match self {
            Call::FindFolder(c) => Ok(Plan {
                risk: Risk::ReadOnly,
                reason: "only lists directories".into(),
                title: "Look for a folder".into(),
                detail: c.query.clone(),
                cwd: None,
            }),
            Call::OpenInEditor(c) => c.plan(ctx),
            Call::OpenApp(c) => c.plan(),
            Call::RunCommand(c) => {
                let verdict = policy::assess_command(&c.command);
                Ok(Plan {
                    risk: verdict.risk,
                    reason: verdict.reason,
                    title: "Run a command".into(),
                    detail: c.command.clone(),
                    cwd: resolve_cwd(c.cwd.as_deref())?,
                })
            }
            Call::DockerRun(c) => c.plan(),
            Call::Scaffold(c) => c.plan(),
            Call::DelegateToClaudeCode(c) => {
                if ctx.claude_cli.is_none() {
                    return Err("Claude Code is not installed".into());
                }
                Ok(Plan {
                    risk: Risk::Change,
                    reason: "Claude Code can edit files in this folder".into(),
                    title: "Hand this job to Claude Code".into(),
                    detail: c.task.clone(),
                    cwd: resolve_cwd(Some(&c.cwd))?,
                })
            }
        }
    }

    pub async fn execute(&self, ctx: &ToolContext, plan: &Plan, host: Arc<dyn Host>) -> ToolOutput {
        let timeout = Duration::from_secs(ctx.config.command_timeout_secs);
        match self {
            Call::FindFolder(c) => c.execute(ctx).await,
            Call::OpenInEditor(c) => c.execute(ctx),
            Call::OpenApp(c) => c.execute(ctx),
            Call::RunCommand(c) => {
                match sys::run_shell(&ctx.shell, &c.command, plan.cwd.as_deref(), timeout).await {
                    Ok(out) => ToolOutput { is_error: !out.ok(), content: out.for_model() },
                    Err(e) => ToolOutput::err(format!("could not start {}: {e}", ctx.shell.name)),
                }
            }
            Call::DockerRun(c) => c.execute(timeout).await,
            Call::Scaffold(c) => c.execute(ctx).await,
            Call::DelegateToClaudeCode(c) => {
                let Some(cli) = ctx.claude_cli.as_deref() else {
                    return ToolOutput::err("Claude Code is not installed");
                };
                let cwd = plan.cwd.clone().unwrap_or_default();
                let job = claude_cli::Job {
                    prompt: &c.task,
                    cwd: &cwd,
                    allowed_tools: &ctx.config.claude_cli_allowed_tools,
                };
                match claude_cli::run(cli, job, host.as_ref()).await {
                    Ok(report) => ToolOutput::ok(report),
                    Err(e) => ToolOutput::err(e.to_string()),
                }
            }
        }
    }
}

/// Short line for speech bubbles and logs.
pub fn summary(plan: &Plan) -> String {
    let detail: String = plan.detail.chars().take(80).collect();
    format!("{}: {}", plan.title, detail)
}

/// Tool definitions sent to the Messages API.
pub fn definitions(ctx: &ToolContext) -> Vec<Value> {
    let mut tools = vec![
        tool(
            "find_folder",
            "Find a folder on the user's machine by name when you don't know its full path, \
             e.g. the user says \"open my-app\". Searches the user's project folders a few levels deep \
             and returns matching absolute paths, best match first. Use it before open_in_editor \
             or run_command whenever the user names a project instead of giving a path.",
            json!({
                "query": {"type": "string", "description": "Folder name or part of it, e.g. \"my-app\"."}
            }),
            &["query"],
        ),
        tool(
            "open_in_editor",
            "Open a folder or file in the user's code editor (VS Code by default). The path must exist; \
             call find_folder first if you only know the name.",
            json!({
                "path": {"type": "string", "description": "Absolute path. `~` is expanded."}
            }),
            &["path"],
        ),
        tool(
            "open_app",
            "Launch a desktop application by its common name, e.g. \"docker\", \"chrome\", \"spotify\", \
             \"terminal\", \"explorer\". Does not wait for it to finish starting.",
            json!({
                "name": {"type": "string", "description": "Application name as a person would say it."}
            }),
            &["name"],
        ),
        tool(
            "run_command",
            &format!(
                "Run one command line in {} and return its exit code and output. Read-only commands \
                 run immediately; anything that changes state asks the user first, so do not ask for \
                 permission in text yourself. Never use it for interactive programs. Output is clipped to 8 KB.",
                ctx.shell.name
            ),
            json!({
                "command": {"type": "string", "description": "The full command line."},
                "cwd": {"type": "string", "description": "Working directory, absolute path. Optional."}
            }),
            &["command"],
        ),
        tool(
            "docker_run",
            "Start a Docker container in the background. Prefer this over run_command for `docker run` \
             because the user gets a clear summary of image, ports and env. If Docker isn't running, \
             open it with open_app first and check with `docker info`.",
            json!({
                "image": {"type": "string", "description": "Image reference, e.g. \"redis/redis-stack:latest\"."},
                "name": {"type": "string", "description": "Container name. Optional."},
                "ports": {"type": "array", "items": {"type": "string"}, "description": "Port maps like \"6379:6379\"."},
                "env": {"type": "array", "items": {"type": "string"}, "description": "Variables like \"KEY=value\"."},
                "volumes": {"type": "array", "items": {"type": "string"}, "description": "Volume maps like \"redis-data:/data\"."}
            }),
            &["image"],
        ),
        tool(
            "scaffold_project",
            "Create a new project from a standard template using the official generator. \
             Templates: nextjs, vite-react, rust, python. Takes a while; tell the user it's running.",
            json!({
                "template": {"type": "string", "enum": ["nextjs", "vite-react", "rust", "python"]},
                "name": {"type": "string", "description": "Folder name for the new project: letters, digits, dot, dash, underscore."},
                "parent_dir": {"type": "string", "description": "Absolute path of the folder to create it in."}
            }),
            &["template", "name", "parent_dir"],
        ),
    ];

    if ctx.claude_cli.is_some() && ctx.config.allow_claude_code_delegation {
        tools.push(tool(
            "delegate_to_claude_code",
            "Hand a multi-step coding job to Claude Code running in a project folder, e.g. \"add auth \
             with Prisma to this app\" or \"fix the failing tests\". Use it only for work that needs \
             reading and editing code; use the other tools for opening, launching and single commands. \
             Returns Claude Code's final report.",
            json!({
                "task": {"type": "string", "description": "Complete instructions. Claude Code sees nothing else from this conversation."},
                "cwd": {"type": "string", "description": "Absolute path of the project folder."}
            }),
            &["task", "cwd"],
        ));
    }
    tools
}

fn tool(name: &str, description: &str, properties: Value, required: &[&str]) -> Value {
    json!({
        "name": name,
        "description": description,
        "strict": true,
        "input_schema": {
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": false,
        }
    })
}

pub(crate) fn expand_home(path: &str) -> PathBuf {
    let trimmed = path.trim().trim_matches('"');
    if let Some(rest) = trimmed.strip_prefix("~") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest.trim_start_matches(['/', '\\']));
        }
    }
    PathBuf::from(trimmed)
}

fn resolve_cwd(cwd: Option<&str>) -> Result<Option<PathBuf>, String> {
    let Some(raw) = cwd.filter(|c| !c.trim().is_empty()) else { return Ok(None) };
    let path = expand_home(raw);
    if !path.is_dir() {
        return Err(format!("working directory does not exist: {}", path.display()));
    }
    Ok(Some(path))
}

/// Safe characters for names we pass as arguments: no spaces, quotes or shell syntax.
pub(crate) fn is_plain_name(s: &str, extra: &[char]) -> bool {
    !s.is_empty()
        && s.len() <= 200
        && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') || extra.contains(&c))
}

pub(crate) fn display_path(p: &Path) -> String {
    p.display().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> ToolContext {
        ToolContext { config: Config::default(), shell: Shell::detect(), claude_cli: None }
    }

    #[test]
    fn rejects_unknown_tools_and_fields() {
        assert!(Call::parse("format_disk", &json!({})).is_err());
        assert!(Call::parse("run_command", &json!({"command": "ls", "sudo": true})).is_err());
    }

    #[test]
    fn run_command_plan_uses_policy() {
        let call = Call::parse("run_command", &json!({"command": "git status"})).unwrap();
        assert_eq!(call.plan(&ctx()).unwrap().risk, Risk::ReadOnly);
        let call = Call::parse("run_command", &json!({"command": "rm -rf dist"})).unwrap();
        assert_eq!(call.plan(&ctx()).unwrap().risk, Risk::Destructive);
    }

    #[test]
    fn delegation_needs_the_cli() {
        let call = Call::parse("delegate_to_claude_code", &json!({"task": "x", "cwd": "."})).unwrap();
        assert!(call.plan(&ctx()).is_err());
        assert!(!definitions(&ctx()).iter().any(|t| t["name"] == "delegate_to_claude_code"));
    }

    #[test]
    fn every_definition_is_a_known_tool() {
        let mut c = ctx();
        c.claude_cli = Some(PathBuf::from("claude"));
        for def in definitions(&c) {
            let name = def["name"].as_str().unwrap();
            let err = Call::parse(name, &json!({})).unwrap_err();
            assert!(!err.contains("unknown tool"), "{name} has a definition but no parser");
            assert_eq!(def["input_schema"]["additionalProperties"], false);
        }
    }
}
