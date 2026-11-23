use std::io;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("no Anthropic API key set. Add one in settings, or switch to the Claude Code provider")]
    MissingApiKey,

    #[error("Anthropic rejected the API key (401). Check it in settings")]
    BadApiKey,

    #[error("Anthropic API error {status}: {message}")]
    Api { status: u16, message: String },

    #[error("network error talking to Anthropic: {0}")]
    Http(#[from] reqwest::Error),

    #[error("the `claude` CLI was not found on PATH")]
    ClaudeCliMissing,

    #[error("claude CLI failed: {0}")]
    ClaudeCli(String),

    #[error("config error: {0}")]
    Config(String),

    #[error(transparent)]
    Io(#[from] io::Error),

    #[error(transparent)]
    Json(#[from] serde_json::Error),
}
