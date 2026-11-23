use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tokio::sync::Mutex;

use crate::config::{Config, ProviderKind};
use crate::event::{AgentEvent, ApprovalRequest, Host};
use crate::policy::Risk;
use crate::providers::{anthropic, claude_cli};
use crate::skills::{self, Skill};
use crate::sys::{self, Shell};
use crate::tools::{self, Call, ToolContext, ToolOutput};
use crate::{Error, Result};

/// One request rarely needs more than a handful of tool rounds. This is a
/// backstop against loops, not a budget.
const MAX_TURNS: usize = 16;
/// Start a fresh conversation after this much quiet. "Open it" an hour later
/// shouldn't refer to whatever we talked about in the morning.
const IDLE_RESET: Duration = Duration::from_secs(15 * 60);
/// We never edit history (the API wants assistant turns back unchanged), so
/// instead of trimming we start over once it gets long.
const MAX_MESSAGES: usize = 60;

enum Brain {
    Api { client: anthropic::Client },
    Cli { path: PathBuf },
}

struct Conversation {
    messages: Vec<Value>,
    last_used: Instant,
}

pub struct Agent {
    ctx: Arc<ToolContext>,
    host: Arc<dyn Host>,
    brain: Brain,
    skills: Vec<Skill>,
    system: String,
    tool_defs: Vec<Value>,
    conversation: Mutex<Conversation>,
    next_approval: AtomicU64,
}

impl Agent {
    pub fn new(config: Config, api_key: Option<String>, skill_dirs: &[PathBuf], host: Arc<dyn Host>) -> Result<Self> {
        let claude_cli = claude_cli::detect();
        let brain = match config.provider {
            ProviderKind::AnthropicApi => {
                let key = api_key
                    .filter(|k| !k.trim().is_empty())
                    .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())
                    .ok_or(Error::MissingApiKey)?;
                Brain::Api { client: anthropic::Client::new(key)? }
            }
            ProviderKind::ClaudeCli => Brain::Cli { path: claude_cli.clone().ok_or(Error::ClaudeCliMissing)? },
        };

        let ctx = Arc::new(ToolContext { config, shell: Shell::detect(), claude_cli });
        let skills = skills::load_all(skill_dirs);
        let system = system_prompt(&ctx, &skills);
        let tool_defs = tools::definitions(&ctx);

        Ok(Self {
            ctx,
            host,
            brain,
            skills,
            system,
            tool_defs,
            conversation: Mutex::new(Conversation { messages: Vec::new(), last_used: Instant::now() }),
            next_approval: AtomicU64::new(1),
        })
    }

    pub fn skills(&self) -> &[Skill] {
        &self.skills
    }

    pub async fn reset(&self) {
        self.conversation.lock().await.messages.clear();
    }

    /// Handle one request from the user. Never returns an error: failures are
    /// reported through [`AgentEvent::Failed`] so the robot can react.
    pub async fn handle(&self, text: &str) {
        let text = text.trim();
        if text.is_empty() {
            return;
        }
        self.host.emit(AgentEvent::Ack { text: text.to_string() });

        let outcome = match &self.brain {
            Brain::Api { client } => self.run_api(client, text).await,
            Brain::Cli { path } => self.run_cli(path, text).await,
        };
        match outcome {
            Ok(reply) => self.host.emit(AgentEvent::Done { text: reply }),
            Err(e) => {
                tracing::error!("request failed: {e}");
                self.host.emit(AgentEvent::Failed { text: e.to_string() });
            }
        }
    }

    async fn run_cli(&self, cli: &std::path::Path, text: &str) -> Result<String> {
        let cwd = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        self.host.emit(AgentEvent::Thinking);
        let job = claude_cli::Job { prompt: text, cwd: &cwd, allowed_tools: &self.ctx.config.claude_cli_allowed_tools };
        claude_cli::run(cli, job, self.host.as_ref()).await
    }

    async fn run_api(&self, client: &anthropic::Client, text: &str) -> Result<String> {
        let mut convo = self.conversation.lock().await;
        if convo.last_used.elapsed() > IDLE_RESET || convo.messages.len() > MAX_MESSAGES {
            convo.messages.clear();
        }
        convo.last_used = Instant::now();
        convo.messages.push(json!({ "role": "user", "content": text }));

        for _ in 0..MAX_TURNS {
            self.host.emit(AgentEvent::Thinking);
            let request = anthropic::Request {
                model: &self.ctx.config.model,
                effort: &self.ctx.config.effort,
                system: &self.system,
                tools: &self.tool_defs,
                messages: &convo.messages,
            };
            let response = match client.create(&request).await {
                Ok(r) => r,
                Err(e) => {
                    // Drop the unanswered user turn so the next request starts clean.
                    rollback_unanswered(&mut convo.messages);
                    return Err(e);
                }
            };

            // Append the whole content array unchanged: thinking blocks and
            // fallback markers must go back exactly as they came.
            convo.messages.push(json!({ "role": "assistant", "content": response.content }));

            match response.stop_reason.as_deref() {
                Some("tool_use") => {
                    let said = response.text();
                    if !said.is_empty() {
                        self.host.emit(AgentEvent::Say { text: said });
                    }
                    let mut results = Vec::new();
                    for block in response.tool_uses() {
                        let id = block["id"].as_str().unwrap_or_default();
                        let name = block["name"].as_str().unwrap_or_default();
                        let output = self.run_tool(name, &block["input"]).await;
                        results.push(json!({
                            "type": "tool_result",
                            "tool_use_id": id,
                            "content": output.content,
                            "is_error": output.is_error,
                        }));
                    }
                    // All results in one user message, in the same order.
                    convo.messages.push(json!({ "role": "user", "content": results }));
                }
                Some("pause_turn") => continue,
                Some("refusal") => {
                    return Ok("I can't help with that one.".into());
                }
                Some("max_tokens") => {
                    let text = response.text();
                    return Ok(if text.is_empty() { "That got too long, try a smaller request.".into() } else { text });
                }
                _ => {
                    let text = response.text();
                    return Ok(if text.is_empty() { "Done.".into() } else { text });
                }
            }
        }
        Ok("I stopped after too many steps. Try breaking it into smaller requests.".into())
    }

    /// Parse, plan, approve (if needed) and execute one tool call.
    pub(crate) async fn run_tool(&self, name: &str, input: &Value) -> ToolOutput {
        let call = match Call::parse(name, input) {
            Ok(c) => c,
            Err(e) => return ToolOutput::err(e),
        };
        let plan = match call.plan(&self.ctx) {
            Ok(p) => p,
            Err(e) => return ToolOutput::err(e),
        };
        let summary = tools::summary(&plan);

        if plan.risk == Risk::Forbidden {
            self.host.emit(AgentEvent::Denied { summary: summary.clone(), reason: plan.reason.clone() });
            return ToolOutput::err(format!(
                "blocked: {}. This is never allowed. Tell the user you won't do it and why.",
                plan.reason
            ));
        }

        if plan.risk.needs_approval() {
            let request = ApprovalRequest {
                id: self.next_approval.fetch_add(1, Ordering::Relaxed),
                title: plan.title.clone(),
                detail: plan.detail.clone(),
                risk: plan.risk,
                cwd: plan.cwd.as_ref().map(|p| p.display().to_string()),
            };
            if !self.host.approve(request).await {
                self.host.emit(AgentEvent::Denied { summary, reason: "you said no".into() });
                return ToolOutput::err("the user declined this action. Don't retry it; ask what they'd like instead.");
            }
        }

        self.host.emit(AgentEvent::ToolStarted { name: call.name().into(), summary });
        let output = call.execute(&self.ctx, &plan, self.host.clone()).await;
        self.host.emit(AgentEvent::ToolFinished {
            name: call.name().into(),
            ok: !output.is_error,
            preview: output.content.lines().next().unwrap_or_default().chars().take(120).collect(),
        });
        output
    }
}

/// If the last message is the user's text (no assistant reply yet), remove it.
fn rollback_unanswered(messages: &mut Vec<Value>) {
    if messages.last().is_some_and(|m| m["role"] == "user" && m["content"].is_string()) {
        messages.pop();
    }
}

fn system_prompt(ctx: &ToolContext, skills: &[Skill]) -> String {
    let home = dirs::home_dir().map(|h| h.display().to_string()).unwrap_or_default();
    let roots: Vec<String> = ctx.config.search_roots().iter().map(|p| p.display().to_string()).collect();
    let mut prompt = format!(
        "You are Boltie, a small robot that lives on the user's desktop and does computer chores for them. \
Requests are short and often spoken, like \"open my-app in VS Code\", \"start a Postgres container\" \
or \"what's running on port 3000?\".

How to work:
- Do the task with your tools instead of explaining how. Look things up (find_folder, read-only commands) \
rather than asking the user for paths.
- If several folders match and one is clearly the project, use it. Ask a short question only when it's \
genuinely ambiguous.
- Actions that change things show the user an approval card automatically. Don't ask for permission in \
text, and if they decline, don't try the same thing another way.
- Your final reply appears in a small speech bubble: one or two plain sentences, no markdown, no lists.

This machine:
- OS: {os}
- Shell for run_command: {shell}
- Home: {home}
- Project folders searched by find_folder: {roots}
- Editor command: {editor}",
        os = sys::os_name(),
        shell = ctx.shell.name,
        roots = if roots.is_empty() { "(none)".into() } else { roots.join(", ") },
        editor = ctx.config.editor,
    );
    prompt.push_str(&skills::prompt_section(skills));
    prompt
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex as StdMutex;

    struct FakeHost {
        allow: bool,
        events: StdMutex<Vec<AgentEvent>>,
        asked: StdMutex<Vec<ApprovalRequest>>,
    }

    #[async_trait::async_trait]
    impl Host for FakeHost {
        fn emit(&self, event: AgentEvent) {
            self.events.lock().unwrap().push(event);
        }
        async fn approve(&self, request: ApprovalRequest) -> bool {
            self.asked.lock().unwrap().push(request);
            self.allow
        }
    }

    fn agent(allow: bool) -> (Agent, Arc<FakeHost>) {
        let host = Arc::new(FakeHost { allow, events: Default::default(), asked: Default::default() });
        let ctx = Arc::new(ToolContext { config: Config::default(), shell: Shell::detect(), claude_cli: None });
        let agent = Agent {
            system: system_prompt(&ctx, &[]),
            tool_defs: tools::definitions(&ctx),
            ctx,
            host: host.clone(),
            brain: Brain::Cli { path: PathBuf::from("claude") },
            skills: Vec::new(),
            conversation: Mutex::new(Conversation { messages: Vec::new(), last_used: Instant::now() }),
            next_approval: AtomicU64::new(1),
        };
        (agent, host)
    }

    #[tokio::test]
    async fn read_only_commands_skip_approval() {
        let (agent, host) = agent(false);
        let out = agent.run_tool("run_command", &json!({"command": "echo hello"})).await;
        assert!(!out.is_error, "{}", out.content);
        assert!(host.asked.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn changes_wait_for_the_user() {
        let (agent, host) = agent(false);
        let out = agent.run_tool("run_command", &json!({"command": "mkdir boltie-should-not-exist"})).await;
        assert!(out.is_error);
        assert!(out.content.contains("declined"));
        assert_eq!(host.asked.lock().unwrap()[0].detail, "mkdir boltie-should-not-exist");
        assert!(!std::path::Path::new("boltie-should-not-exist").exists());
    }

    #[tokio::test]
    async fn forbidden_commands_never_reach_the_user() {
        let (agent, host) = agent(true);
        let out = agent.run_tool("run_command", &json!({"command": "rm -rf /"})).await;
        assert!(out.is_error);
        assert!(host.asked.lock().unwrap().is_empty());
        assert!(matches!(host.events.lock().unwrap()[0], AgentEvent::Denied { .. }));
    }

    #[test]
    fn rollback_only_removes_plain_user_text() {
        let mut messages = vec![json!({"role": "user", "content": "hi"})];
        rollback_unanswered(&mut messages);
        assert!(messages.is_empty());

        let mut messages = vec![json!({"role": "user", "content": [{"type": "tool_result"}]})];
        rollback_unanswered(&mut messages);
        assert_eq!(messages.len(), 1);
    }
}
