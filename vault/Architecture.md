# Architecture

Three parts in one repo.

`crates/boltie-core` - the brain. No UI code in here.
- `agent.rs` - takes one request, runs the loop, emits events. Never returns an error to the caller, failures become a `Failed` event so the robot can look sad about it.
- `tools/` - each tool is parsed into a typed `Call`, turned into a `Plan` (what exactly will run, how risky), then executed. The agent asks the user between plan and execute when the plan says so.
- `policy.rs` - looks at a command line and says read-only / change / destructive / forbidden. It's a heuristic and it leans toward asking. Anything it doesn't recognise counts as a change.
- `providers/anthropic.rs` - raw HTTP to the Messages API. There's no official Rust SDK. Content blocks are kept as raw JSON so assistant turns go back unchanged.
- `providers/claude_cli.rs` - runs the user's `claude -p` and reads `stream-json`. See [[Claude Code headless]].
- `skills.rs` - markdown files with a small front matter. Their text goes into the system prompt. They don't get extra permissions.
- `event.rs` - `AgentEvent` (what the frontend sees) and the `Host` trait (emit events, ask for approval).

`apps/desktop` - Tauri 2 app.
- `src-tauri/src/main.rs` - tray, hotkey, setup.
- `src-tauri/src/display.rs` - which screen he's on, neighbours left/right, moving the overlay between screens.
- `src-tauri/src/hit.rs` - click-through. See [[0003 Click-through by polling the cursor]].
- `src-tauri/src/host.rs` - implements `Host`. Approvals are a map of id -> oneshot channel, resolved by the `respond_approval` command. Times out to "no".
- `src-tauri/src/state.rs` - commands the webview calls. Rebuilds the agent whenever config or key changes.
- `src/robot.ts` - the robot, built from primitives. orthographic camera in CSS pixels, eyes drawn on a canvas, flying, dragging, moods.
- `src/dock.ts` - the card: chat, permission and settings views.
- `src/sound.ts` - UI sounds (from poupou).
- `src/main.ts` - maps agent events to moods and the card, drag and right-click, hit regions, screens.

`apps/web` - landing page. Static, no backend.

how a request flows
1. user types in the command bar (or clicks the robot first)
2. webview calls `send_command`, Rust spawns `agent.handle()` on the async runtime
3. agent emits `ack`, robot nods
4. model asks for tools; each one is planned, maybe approved, then run
5. every step emits an event; robot changes mood, bubble shows what's happening
6. `done` or `failed` at the end, robot gives a thumbs up or shakes its head

things to keep true
- the core crate never depends on Tauri
- nothing destructive runs without a click, nothing forbidden runs at all
- the API key only lives in the OS keychain
- we never edit model history, we start a new conversation instead
