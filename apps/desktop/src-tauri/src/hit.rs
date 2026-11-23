//! Per-region click-through.
//!
//! The robot window spans the bottom of the screen but is mostly empty. The OS
//! can only make a whole window click-through, not parts of it, so we poll the
//! cursor: when it's over the robot or an open panel the window takes clicks,
//! otherwise clicks fall through to whatever is underneath.
//!
//! The frontend reports its interactive rectangles in physical pixels relative
//! to the window. Polling at ~30 Hz costs next to nothing and avoids hooking
//! global mouse events.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

const POLL: Duration = Duration::from_millis(33);

/// The webview only sees mouse moves while it takes clicks. The robot's eyes
/// follow the cursor all the time, so we forward the position from here.
pub const CURSOR: &str = "boltie://cursor";

#[derive(Clone, Copy, PartialEq, Serialize)]
struct Cursor {
    x: i32,
    y: i32,
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Rect {
    fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x <= self.x + self.w && y >= self.y && y <= self.y + self.h
    }
}

#[derive(Clone, Default)]
pub struct HitTester {
    regions: Arc<Mutex<Vec<Rect>>>,
    /// While true the whole window takes clicks (approval card, settings).
    hold: Arc<AtomicBool>,
}

impl HitTester {
    pub fn set_regions(&self, regions: Vec<Rect>) {
        *self.regions.lock().unwrap() = regions;
    }

    pub fn hold_interactive(&self, hold: bool) {
        self.hold.store(hold, Ordering::Relaxed);
    }

    pub fn start(&self, app: AppHandle) {
        let this = self.clone();
        thread::Builder::new()
            .name("boltie-hit-test".into())
            .spawn(move || {
                let mut ignoring: Option<bool> = None;
                let mut last_cursor: Option<Cursor> = None;
                loop {
                    thread::sleep(POLL);
                    let Some(window) = app.get_webview_window("main") else { break };
                    let cursor = relative_cursor(&app, &window);
                    if cursor.is_some() && cursor != last_cursor {
                        last_cursor = cursor;
                        let _ = app.emit(CURSOR, cursor);
                    }
                    let over = this.hold.load(Ordering::Relaxed)
                        || cursor.is_some_and(|c| this.over_region(c.x as f64, c.y as f64));
                    let ignore = !over;
                    if ignoring != Some(ignore)
                        && window.set_ignore_cursor_events(ignore).is_ok() {
                            ignoring = Some(ignore);
                        }
                }
            })
            .expect("spawn hit-test thread");
    }

    fn over_region(&self, x: f64, y: f64) -> bool {
        self.regions.lock().unwrap().iter().any(|r| r.contains(x, y))
    }
}

/// Cursor position in physical pixels relative to the window's top-left.
fn relative_cursor(app: &AppHandle, window: &WebviewWindow) -> Option<Cursor> {
    let cursor = app.cursor_position().ok()?;
    let origin = window.inner_position().ok()?;
    Some(Cursor { x: (cursor.x - origin.x as f64).round() as i32, y: (cursor.y - origin.y as f64).round() as i32 })
}
