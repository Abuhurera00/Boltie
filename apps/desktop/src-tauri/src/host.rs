//! Connects the agent to the webview: events go out, approvals come back.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use async_trait::async_trait;
use boltie_core::{AgentEvent, ApprovalRequest, Host};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;

use crate::hit::HitTester;

pub const EVENT: &str = "boltie://event";
pub const APPROVAL: &str = "boltie://approval";

/// Nobody clicked within this long? Treat it as a no.
const APPROVAL_TIMEOUT: Duration = Duration::from_secs(5 * 60);

pub struct TauriHost {
    app: AppHandle,
    pending: Mutex<HashMap<u64, oneshot::Sender<bool>>>,
}

impl TauriHost {
    pub fn new(app: AppHandle) -> Self {
        Self { app, pending: Mutex::new(HashMap::new()) }
    }

    /// Called from the `respond_approval` command.
    pub fn resolve(&self, id: u64, approved: bool) -> bool {
        tracing::info!(id, approved, "approval answered");
        match self.pending.lock().unwrap().remove(&id) {
            Some(tx) => tx.send(approved).is_ok(),
            None => false,
        }
    }

    /// Decline everything still waiting, e.g. when the user cancels.
    pub fn decline_all(&self) {
        for (_, tx) in self.pending.lock().unwrap().drain() {
            let _ = tx.send(false);
        }
    }
}

#[async_trait]
impl Host for TauriHost {
    fn emit(&self, event: AgentEvent) {
        tracing::info!(target: "boltie::agent", "{}", serde_json::to_string(&event).unwrap_or_default());
        if let Err(e) = self.app.emit(EVENT, &event) {
            tracing::warn!("could not emit event: {e}");
        }
    }

    async fn approve(&self, request: ApprovalRequest) -> bool {
        let (tx, rx) = oneshot::channel();
        let id = request.id;
        self.pending.lock().unwrap().insert(id, tx);

        // The approval card needs clicks, so make sure the window takes them.
        if let Some(hit) = self.app.try_state::<HitTester>() {
            hit.hold_interactive(true);
        }
        if let Err(e) = self.app.emit(APPROVAL, &request) {
            tracing::warn!("could not show approval card: {e}");
            self.pending.lock().unwrap().remove(&id);
            return false;
        }

        tracing::info!(id, title = %request.title, risk = ?request.risk, "approval requested");
        let approved = matches!(tokio::time::timeout(APPROVAL_TIMEOUT, rx).await, Ok(Ok(true)));
        tracing::info!(id, approved, "approval settled");
        self.pending.lock().unwrap().remove(&id);
        if let Some(hit) = self.app.try_state::<HitTester>() {
            hit.hold_interactive(false);
        }
        approved
    }
}
