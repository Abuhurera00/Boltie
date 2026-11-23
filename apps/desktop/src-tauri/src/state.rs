//! App state and the commands the webview can call.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use boltie_core::providers::claude_cli;
use boltie_core::{Agent, AgentEvent, Config, Host, ProviderKind};
use serde::Serialize;
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Manager, State};

use crate::hit::{HitTester, Rect};
use crate::host::TauriHost;
use crate::secrets;

pub struct AppState {
    pub host: Arc<TauriHost>,
    config_path: PathBuf,
    config: Mutex<Config>,
    skill_dirs: Vec<PathBuf>,
    agent: RwLock<Option<Arc<Agent>>>,
    setup_error: Mutex<Option<String>>,
    running: Mutex<Option<JoinHandle<()>>>,
    busy: Arc<AtomicBool>,
}

impl AppState {
    pub fn new(app: &AppHandle) -> Self {
        let config_path = Config::default_path().unwrap_or_else(|_| PathBuf::from("boltie.toml"));
        let config = Config::load(&config_path).unwrap_or_else(|e| {
            tracing::error!("{e}; using defaults");
            Config::default()
        });

        // Bundled skills first, then the user's own, so theirs win on name clashes.
        let mut skill_dirs = Vec::new();
        if let Ok(resources) = app.path().resource_dir() {
            skill_dirs.push(resources.join("skills"));
        }
        if cfg!(debug_assertions) {
            skill_dirs.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../skills"));
        }
        if let Ok(dir) = Config::dir() {
            skill_dirs.push(dir.join("skills"));
        }

        let state = Self {
            host: Arc::new(TauriHost::new(app.clone())),
            config_path,
            config: Mutex::new(config),
            skill_dirs,
            agent: RwLock::new(None),
            setup_error: Mutex::new(None),
            running: Mutex::new(None),
            busy: Arc::new(AtomicBool::new(false)),
        };
        state.rebuild_agent();
        state
    }

    /// Recreate the agent after config or key changes.
    fn rebuild_agent(&self) {
        let config = self.config.lock().unwrap().clone();
        let host: Arc<dyn Host> = self.host.clone();
        match Agent::new(config, secrets::api_key(), &self.skill_dirs, host) {
            Ok(agent) => {
                *self.agent.write().unwrap() = Some(Arc::new(agent));
                *self.setup_error.lock().unwrap() = None;
            }
            Err(e) => {
                *self.agent.write().unwrap() = None;
                *self.setup_error.lock().unwrap() = Some(e.to_string());
            }
        }
    }

    pub fn screen(&self) -> Option<String> {
        self.config.lock().unwrap().screen.clone()
    }

    pub fn set_screen(&self, screen: Option<String>) -> Result<(), String> {
        let mut config = self.config.lock().unwrap();
        config.screen = screen;
        config.save(&self.config_path).map_err(|e| e.to_string())
    }

    pub fn hotkey(&self) -> String {
        self.config.lock().unwrap().hotkey.clone()
    }

    fn busy(&self) -> bool {
        self.busy.load(Ordering::SeqCst)
    }

    fn cancel(&self) {
        if let Some(handle) = self.running.lock().unwrap().take() {
            handle.abort();
        }
        self.busy.store(false, Ordering::SeqCst);
        self.host.decline_all();
    }
}

#[derive(Serialize)]
pub struct Status {
    ready: bool,
    problem: Option<String>,
    provider: ProviderKind,
    model: String,
    has_api_key: bool,
    claude_cli: Option<String>,
    skills: Vec<String>,
    busy: bool,
}

const STOP_WORDS: &[&str] = &["stop", "cancel", "never mind", "nevermind", "abort"];

#[tauri::command]
pub fn send_command(state: State<'_, AppState>, text: String) {
    let text = text.trim().to_string();
    if text.is_empty() {
        return;
    }
    if STOP_WORDS.contains(&text.to_lowercase().as_str()) {
        let was_busy = state.busy();
        state.cancel();
        state.host.emit(AgentEvent::Done { text: if was_busy { "Stopped.".into() } else { "Nothing to stop.".into() } });
        return;
    }
    if state.busy() {
        state.host.emit(AgentEvent::Say { text: "Still on the last one. Say \"stop\" to cancel it.".into() });
        return;
    }
    let agent = state.agent.read().unwrap().clone();
    let Some(agent) = agent else {
        let problem = state.setup_error.lock().unwrap().clone().unwrap_or_else(|| "not set up yet".into());
        state.host.emit(AgentEvent::Failed { text: problem });
        return;
    };
    let busy = state.busy.clone();
    busy.store(true, Ordering::SeqCst);
    let handle = tauri::async_runtime::spawn(async move {
        agent.handle(&text).await;
        busy.store(false, Ordering::SeqCst);
    });
    *state.running.lock().unwrap() = Some(handle);
}

#[tauri::command]
pub fn cancel(state: State<'_, AppState>) {
    state.cancel();
}

#[tauri::command]
pub fn respond_approval(state: State<'_, AppState>, id: u64, approved: bool) -> bool {
    state.host.resolve(id, approved)
}

#[tauri::command]
pub fn status(state: State<'_, AppState>) -> Status {
    let config = state.config.lock().unwrap().clone();
    let agent = state.agent.read().unwrap().clone();
    Status {
        ready: agent.is_some(),
        problem: state.setup_error.lock().unwrap().clone(),
        provider: config.provider,
        model: config.model,
        has_api_key: secrets::api_key().is_some(),
        claude_cli: claude_cli::detect().map(|p| p.display().to_string()),
        skills: agent.map(|a| a.skills().iter().map(|s| s.name.clone()).collect()).unwrap_or_default(),
        busy: state.busy(),
    }
}

#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> Config {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
pub fn save_config(state: State<'_, AppState>, config: Config) -> Result<(), String> {
    config.save(&state.config_path).map_err(|e| e.to_string())?;
    *state.config.lock().unwrap() = config;
    state.rebuild_agent();
    Ok(())
}

#[tauri::command]
pub fn set_api_key(state: State<'_, AppState>, key: String) -> Result<(), String> {
    if !key.trim().starts_with("sk-ant-") {
        return Err("that doesn't look like an Anthropic key (they start with sk-ant-)".into());
    }
    secrets::set_api_key(&key)?;
    state.rebuild_agent();
    Ok(())
}

#[tauri::command]
pub fn clear_api_key(state: State<'_, AppState>) -> Result<(), String> {
    secrets::clear_api_key()?;
    state.rebuild_agent();
    Ok(())
}

#[tauri::command]
pub async fn reset_conversation(state: State<'_, AppState>) -> Result<(), String> {
    let agent = state.agent.read().unwrap().clone();
    if let Some(agent) = agent {
        agent.reset().await;
    }
    Ok(())
}

#[tauri::command]
pub fn set_hit_regions(hit: State<'_, HitTester>, regions: Vec<Rect>) {
    hit.set_regions(regions);
}

#[tauri::command]
pub fn hold_interactive(hit: State<'_, HitTester>, hold: bool) {
    hit.hold_interactive(hold);
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Hide until the tray icon or the hotkey brings him back.
#[tauri::command]
pub fn hide_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

/// The command bar needs keyboard focus, which a click-through window never gets on its own.
#[tauri::command]
pub fn focus_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_ignore_cursor_events(false);
        let _ = window.set_focus();
    }
}
