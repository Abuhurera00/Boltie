# Roadmap

Rule: one line per thing you can actually ship and check. If a line takes more than a couple of days, split it.

## v0.1 - it flies and it works

- [x] monorepo: cargo workspace + pnpm workspace (`crates/`, `apps/desktop`, `apps/web`)
- [x] `boltie-core` crate with no Tauri dependency, so it can be tested on its own
- [x] safety policy for shell commands (read-only / change / destructive / forbidden), with tests
- [x] tools: find_folder, open_in_editor, open_app, run_command, docker_run, scaffold_project
- [x] Messages API provider, own tool loop, retries, refusal fallback
- [x] Claude Code provider: runs the user's `claude` CLI, streams progress
- [x] Claude Code permission denials turn into approval cards, then resume the session
- [x] hand big coding jobs from the API brain to Claude Code (delegate_to_claude_code)
- [x] skills as markdown files (bundled + `~/.config/boltie/skills`)
- [x] transparent always-on-top overlay over the work area
- [x] click-through except over the robot and open panels
- [x] our own robot built in code: visor eyes, antenna, hands, jet. flies, no legs
- [x] moods per agent event (colour, eyes, motion), eyes follow the cursor
- [x] one card for chat / permission / settings, poupou style, with sounds
- [x] Y / N / Esc on the permission card, Y never approves destructive
- [x] API key in the OS keychain
- [x] tray menu, global hotkey (Ctrl+Shift+Space), single instance
- [x] drag him anywhere, he remembers the height
- [x] right-click menu: talk, settings, fly back down, hide, quit
- [x] multi-monitor: flies across to the next screen, hotkey brings him to the cursor's screen
- [x] pick a screen to keep him on (settings or right-click > Screen), or let him roam. saved by display name
- [ ] run it end to end on Windows with a real key and record the demo gif
- [ ] check the same on macOS
- [ ] check on Linux X11, then Wayland (transparency and click-through are the likely problems)
- [ ] confirm `create-vite` doesn't stop on a prompt when stdin is closed
- [ ] github actions: cargo test, clippy, tsc on all three OSes
- [ ] try the API-key brain end to end with a real key
- [ ] get `astro check` working under pnpm 11
- [ ] dragging across screens (right now you drag within one screen, he flies across on his own)

## v0.2 - feels alive

- [ ] pause and hide when a fullscreen app or game is in front (idea from [[Deskland]])
- [ ] stop button on the bubble while a job runs
- [ ] show a short history of what he did today (click the robot, see list)
- [ ] "remember this as X" - save the last request's tool calls as a skill
- [ ] streaming responses so the bubble fills in while the model types

## v0.3 - voice

- [ ] push-to-talk hotkey
- [ ] pick one cloud speech-to-text provider, key optional, behind a trait
- [ ] the robot looks at you while listening
- [ ] optional text-to-speech for short replies

## later

- [ ] custom avatars: load a GLB the user picks (e.g. "cute robot" by victory_, CC BY), VRM after that
- [ ] Boltie as an MCP client, so people can plug in existing servers
- [ ] expose Boltie's tools to Claude Code over MCP, so the CLI brain can use open_app etc. directly
- [ ] signed installers (Windows, macOS notarization)
- [ ] auto-update

## won't do (for now)

- local models through Ollama. Too heavy to install, see [[0002 Two brains, both online]]
- reading Claude Code's credentials file. We only ever run the user's own CLI.
