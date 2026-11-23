//! The two brains Boltie can use.
//!
//! - [`anthropic`]: Boltie runs the tool loop itself against the Messages API.
//!   Needs an API key; fastest for small desktop commands.
//! - [`claude_cli`]: Boltie hands the request to the user's own `claude` CLI and
//!   streams its progress. No key needed if Claude Code is already logged in.

pub mod anthropic;
pub mod claude_cli;
