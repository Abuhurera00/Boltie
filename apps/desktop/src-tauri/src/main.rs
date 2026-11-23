// No console window in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod display;
mod hit;
mod host;
mod secrets;
mod state;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::hit::HitTester;
use crate::state::AppState;

/// Sent to the webview when the hotkey or tray asks for the command bar.
const SUMMON: &str = "boltie://summon";
const OPEN_SETTINGS: &str = "boltie://settings";

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "boltie=info,boltie_core=info".into()),
        )
        .init();

    // Before any thread starts: Finder-launched apps can't see Homebrew or npm.
    boltie_core::sys::fix_gui_path();

    tauri::Builder::default()
        // A second launch just summons the first one.
        .plugin(tauri_plugin_single_instance::init(|app, _, _| summon(app)))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            state::send_command,
            state::cancel,
            state::respond_approval,
            state::status,
            state::get_config,
            state::save_config,
            state::set_api_key,
            state::clear_api_key,
            state::reset_conversation,
            state::set_hit_regions,
            state::hold_interactive,
            state::focus_window,
            state::quit_app,
            state::hide_window,
            display::display_layout,
            display::move_to_display,
            display::set_home_screen,
        ])
        .setup(|app| {
            // A menu bar app on macOS: no Dock icon, no app switcher entry.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let handle = app.handle().clone();

            let hit = HitTester::default();
            app.manage(hit.clone());
            let state = AppState::new(&handle);
            let hotkey = state.hotkey();
            let pinned = state.screen();
            app.manage(state);

            let window = app.get_webview_window("main").expect("main window is defined in tauri.conf.json");
            display::place_initially(&window, pinned.as_deref())?;
            window.set_ignore_cursor_events(true)?;
            window.show()?;
            hit.start(handle.clone());

            if let Err(e) = app.global_shortcut().on_shortcut(hotkey.as_str(), |app, _, event| {
                if event.state == ShortcutState::Pressed {
                    summon(app);
                }
            }) {
                tracing::warn!("could not register hotkey {hotkey}: {e}");
            }

            build_tray(&handle)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Boltie");
}

#[derive(Clone, Serialize)]
struct Summon {
    /// True when the window just jumped to the display under the cursor.
    moved: bool,
}

fn summon(app: &AppHandle) {
    let mut moved = false;
    if let Some(window) = app.get_webview_window("main") {
        // While pinned to one screen the hotkey doesn't drag him elsewhere.
        let roaming = app.try_state::<AppState>().is_none_or(|s| s.screen().is_none());
        if roaming {
            moved = display::follow_cursor(app, &window);
        }
        let _ = window.show();
        let _ = window.set_ignore_cursor_events(false);
        let _ = window.set_focus();
    }
    let _ = app.emit(SUMMON, Summon { moved });
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let talk = MenuItem::with_id(app, "talk", "Talk to Boltie", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "toggle", "Hide / show", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&talk, &settings, &hide, &quit])?;

    let mut tray = TrayIconBuilder::with_id("boltie").tooltip("Boltie").menu(&menu);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.on_menu_event(|app, event| match event.id().as_ref() {
        "talk" => summon(app),
        "settings" => {
            summon(app);
            let _ = app.emit(OPEN_SETTINGS, ());
        }
        "toggle" => {
            if let Some(window) = app.get_webview_window("main") {
                if window.is_visible().unwrap_or(true) {
                    let _ = window.hide();
                } else {
                    let _ = window.show();
                }
            }
        }
        "quit" => app.exit(0),
        _ => {}
    })
    .build(app)?;
    Ok(())
}
