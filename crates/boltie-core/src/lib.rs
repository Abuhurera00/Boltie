//! Everything Boltie does that isn't drawing the robot.
//!
//! The desktop app owns the window, keychain and UI. This crate owns the agent
//! loop, the tools it can call, and the policy that decides which of those calls
//! need a human click first. Keeping it separate means it can be tested without
//! a webview and reused by a CLI later.

pub mod agent;
pub mod config;
pub mod error;
pub mod event;
pub mod policy;
pub mod providers;
pub mod skills;
pub mod sys;
pub mod tools;

pub use agent::Agent;
pub use config::{Config, ProviderKind};
pub use error::{Error, Result};
pub use event::{AgentEvent, ApprovalRequest, Host};
pub use policy::Risk;
