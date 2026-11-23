# Boltie

Desktop robot that does computer chores. Rust (Tauri 2) + TypeScript + three.js, pnpm + cargo workspaces.

Read before changing anything:
- `vault/Home.md`, `vault/Architecture.md`, `vault/Roadmap.md` (Obsidian vault, plain markdown)

When you finish something:
- tick it in `vault/Roadmap.md`
- add a line to today's note in `vault/Log/YYYY-MM-DD.md` (create it from `vault/Templates/Log.md` if missing)
- a choice someone could question later gets a note in `vault/Decisions/`

Commands:
- `pnpm install`
- `pnpm dev` run the desktop app
- `cargo test --workspace` and `pnpm -r typecheck` before calling something done

Rules:
- `crates/boltie-core` must not depend on Tauri
- every new tool needs a `plan()` with an honest risk level and a test for it
- never read Claude Code credential files; only run the user's `claude` binary
- the API key only goes in the OS keychain
