# 0003 Click-through by polling the cursor

status: accepted
date: 2026-11-18

why we had to decide
- the window covers the whole work area of one screen (so the robot can be dragged anywhere) but is almost all empty. clicks on empty parts must reach the apps underneath.
- operating systems only make a whole window click-through, there's no per-pixel option in Tauri.

what we picked
- the webview reports interactive rectangles (robot, open panels) in physical pixels
- a Rust thread checks the cursor ~30 times a second and flips `set_ignore_cursor_events` only when the answer changes
- approval card, settings and dragging "hold" the window interactive
- the same thread forwards the cursor position to the webview, so the eyes can follow it even while the window ignores the mouse

what we gave up
- up to ~33 ms before the robot reacts to a hover. nobody notices.
- a tiny bit of CPU. measured nothing noticeable in dev, recheck in release builds.

alternatives we skipped
- global mouse hooks: needs more permissions on macOS and feels invasive
- shaping the window with OS regions: different API per OS, breaks with animation
