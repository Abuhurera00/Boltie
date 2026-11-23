# 0001 Tauri not Electron

status: accepted
date: 2026-11-18

why we had to decide
- the app sits on screen all day. RAM and idle CPU matter more than for most apps.
- we need transparent, always-on-top, click-through windows, process spawning and the OS keychain.

what we picked
- Tauri 2. Rust backend, system webview (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux).
- the agent lives in a plain Rust crate (`boltie-core`) so it doesn't care which shell hosts it.

what we gave up
- one browser engine everywhere. WebKitGTK on Linux is the weak spot for WebGL and transparency, test there early.
- poupou is Electron, so we can't copy its main-process code as is. Its UI ideas carry over fine.
