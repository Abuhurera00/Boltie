//! Which screen the robot lives on, and moving him between screens.
//!
//! The window covers one display's work area (transparent and click-through
//! except over the robot), so he can be dragged anywhere on it.
//!
//! Two modes, picked in settings or the right-click menu:
//! - roam (default): he flies off one edge and comes in on the neighbouring
//!   display, and the hotkey brings him to whichever display the cursor is on.
//! - pinned: he stays on one display. The choice is stored by the display's
//!   name, so it survives restarts and displays being reordered.

use serde::Serialize;
use tauri::{AppHandle, Monitor, PhysicalPosition, PhysicalSize, State, WebviewWindow};

use crate::state::AppState;

/// Two displays count as side by side when their edges are this close.
const EDGE_SLACK: i32 = 64;

#[derive(Debug, Clone, Serialize)]
pub struct Screen {
    pub index: usize,
    /// OS name, e.g. `\\.\DISPLAY2`. This is what gets saved.
    pub name: String,
    /// What the user sees, e.g. "Screen 2 · 1920×1080".
    pub label: String,
    pub primary: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct Layout {
    pub screens: Vec<Screen>,
    pub current: usize,
    /// Neighbouring displays he may fly to. Always empty when pinned.
    pub left: Option<usize>,
    pub right: Option<usize>,
    /// Name of the display he's pinned to, if any.
    pub pinned: Option<String>,
}

/// Displays ordered left to right, so indexes read naturally.
fn monitors(window: &WebviewWindow) -> tauri::Result<Vec<Monitor>> {
    let mut list = window.available_monitors()?;
    list.sort_by_key(|m| (m.position().x, m.position().y));
    Ok(list)
}

fn name_of(monitor: &Monitor, index: usize) -> String {
    monitor.name().cloned().unwrap_or_else(|| format!("screen-{}", index + 1))
}

/// The display that holds the middle of the window.
fn current_index(window: &WebviewWindow, list: &[Monitor]) -> usize {
    let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) else { return 0 };
    let cx = pos.x + size.width as i32 / 2;
    let cy = pos.y + size.height as i32 / 2;
    index_at(list, cx, cy).unwrap_or(0)
}

fn index_at(list: &[Monitor], x: i32, y: i32) -> Option<usize> {
    list.iter().position(|m| {
        let p = m.position();
        let s = m.size();
        x >= p.x && x < p.x + s.width as i32 && y >= p.y && y < p.y + s.height as i32
    })
}

fn index_named(list: &[Monitor], name: &str) -> Option<usize> {
    list.iter().enumerate().position(|(i, m)| name_of(m, i) == name)
}

fn overlaps_vertically(a: &Monitor, b: &Monitor) -> bool {
    let (a_top, a_bottom) = (a.position().y, a.position().y + a.size().height as i32);
    let (b_top, b_bottom) = (b.position().y, b.position().y + b.size().height as i32);
    a_top < b_bottom && b_top < a_bottom
}

fn neighbour(list: &[Monitor], current: usize, want_left: bool) -> Option<usize> {
    let me = &list[current];
    let my_left = me.position().x;
    let my_right = my_left + me.size().width as i32;
    list.iter().enumerate().find_map(|(i, m)| {
        if i == current || !overlaps_vertically(me, m) {
            return None;
        }
        let gap = if want_left { m.position().x + m.size().width as i32 - my_left } else { m.position().x - my_right };
        (gap.abs() <= EDGE_SLACK).then_some(i)
    })
}

pub fn layout(window: &WebviewWindow, pinned: Option<String>) -> tauri::Result<Layout> {
    let list = monitors(window)?;
    let primary = window.primary_monitor()?.and_then(|m| m.name().cloned());
    let screens = list
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let name = name_of(m, i);
            let is_primary = primary.as_deref() == Some(name.as_str());
            let size = m.size();
            let mut label = format!("Screen {} · {}×{}", i + 1, size.width, size.height);
            if is_primary {
                label.push_str(" (main)");
            }
            Screen { index: i, name, label, primary: is_primary }
        })
        .collect();

    if list.is_empty() {
        return Ok(Layout { screens, current: 0, left: None, right: None, pinned });
    }
    let current = current_index(window, &list).min(list.len() - 1);
    let roaming = pinned.is_none();
    Ok(Layout {
        screens,
        current,
        left: if roaming { neighbour(&list, current, true) } else { None },
        right: if roaming { neighbour(&list, current, false) } else { None },
        pinned,
    })
}

/// Cover a display's work area (everything except the taskbar or dock).
fn place_on(window: &WebviewWindow, monitor: &Monitor) -> tauri::Result<()> {
    let area = monitor.work_area();
    let position = PhysicalPosition::new(area.position.x, area.position.y);
    let size = PhysicalSize::new(area.size.width, area.size.height);
    window.set_position(position)?;
    window.set_size(size)?;
    // Crossing into a display with different scaling makes Windows resize the
    // window on its own, so set the size once more after the move.
    window.set_size(size)?;
    window.set_position(position)?;
    Ok(())
}

/// Start on the pinned display if it's connected, otherwise the primary one.
pub fn place_initially(window: &WebviewWindow, pinned: Option<&str>) -> tauri::Result<()> {
    let list = monitors(window)?;
    if let Some(index) = pinned.and_then(|name| index_named(&list, name)) {
        return place_on(window, &list[index]);
    }
    if let Some(monitor) = window.primary_monitor()?.or(window.current_monitor()?) {
        place_on(window, &monitor)?;
    }
    Ok(())
}

/// Move to the display under the cursor. Returns true if the window moved.
/// Only used while roaming.
pub fn follow_cursor(app: &AppHandle, window: &WebviewWindow) -> bool {
    let (Ok(list), Ok(cursor)) = (monitors(window), app.cursor_position()) else { return false };
    let Some(target) = index_at(&list, cursor.x as i32, cursor.y as i32) else { return false };
    if target == current_index(window, &list) {
        return false;
    }
    place_on(window, &list[target]).is_ok()
}

#[tauri::command]
pub fn display_layout(window: WebviewWindow, state: State<'_, AppState>) -> Result<Layout, String> {
    layout(&window, state.screen()).map_err(|e| e.to_string())
}

/// Fly over to a neighbouring display. Ignored while pinned.
#[tauri::command]
pub fn move_to_display(window: WebviewWindow, state: State<'_, AppState>, index: usize) -> Result<Layout, String> {
    let pinned = state.screen();
    if pinned.is_none() {
        let list = monitors(&window).map_err(|e| e.to_string())?;
        if let Some(monitor) = list.get(index) {
            place_on(&window, monitor).map_err(|e| e.to_string())?;
        }
    }
    layout(&window, pinned).map_err(|e| e.to_string())
}

/// Pin him to a display by name, or pass `None` to let him roam.
#[tauri::command]
pub fn set_home_screen(window: WebviewWindow, state: State<'_, AppState>, name: Option<String>) -> Result<Layout, String> {
    state.set_screen(name.clone())?;
    if let Some(name) = &name {
        let list = monitors(&window).map_err(|e| e.to_string())?;
        let index = index_named(&list, name).ok_or_else(|| format!("{name} is not connected"))?;
        place_on(&window, &list[index]).map_err(|e| e.to_string())?;
    }
    layout(&window, name).map_err(|e| e.to_string())
}
