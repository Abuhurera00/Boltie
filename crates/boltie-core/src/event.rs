use async_trait::async_trait;
use serde::Serialize;

use crate::policy::Risk;

/// What the agent is doing right now. The frontend maps each variant to an
/// animation and, where it makes sense, a speech bubble.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentEvent {
    /// Request accepted. Sent immediately so the robot can react before the
    /// first network round trip finishes.
    Ack { text: String },
    /// Waiting on the model.
    Thinking,
    /// Text the model wants to say out loud (partial or between tool calls).
    Say { text: String },
    /// A tool started running.
    ToolStarted { name: String, summary: String },
    /// A tool finished.
    ToolFinished { name: String, ok: bool, preview: String },
    /// A tool call was blocked by policy or declined by the user.
    Denied { summary: String, reason: String },
    /// The whole request is done.
    Done { text: String },
    /// The request failed. `text` is safe to show to the user.
    Failed { text: String },
}

/// Shown to the user before a risky action runs.
#[derive(Debug, Clone, Serialize)]
pub struct ApprovalRequest {
    pub id: u64,
    /// Short human sentence, e.g. "Run a Docker container".
    pub title: String,
    /// The exact thing that will run. Never paraphrased.
    pub detail: String,
    pub risk: Risk,
    /// Extra context like the working directory.
    pub cwd: Option<String>,
}

/// The outside world from the agent's point of view: somewhere to send events
/// and someone to ask before doing something risky.
#[async_trait]
pub trait Host: Send + Sync {
    fn emit(&self, event: AgentEvent);

    /// Resolve to `true` only when the user explicitly allowed the action.
    /// Implementations should time out to `false`, never to `true`.
    async fn approve(&self, request: ApprovalRequest) -> bool;
}
