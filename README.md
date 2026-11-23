# Boltie

A small round robot that flies around your desktop and does computer chores for you.

Some things you could ask:

> "open my-app in VS Code"
> "start a Postgres container for local dev"
> "what's running on port 3000?"

Press `Ctrl+Shift+Space` (`Cmd+Shift+Space` on a Mac) or click him, type what you want, and he does it. Anything that changes your machine shows you the exact command first. Some commands he won't run at all.

## Download

- Windows: [installer (.exe)](https://github.com/Abuhurera00/boltie/releases/latest/download/Boltie-windows-x64-setup.exe) or [.msi](https://github.com/Abuhurera00/boltie/releases/latest/download/Boltie-windows-x64.msi)
- macOS, Apple silicon: [Boltie-macos-arm64.dmg](https://github.com/Abuhurera00/boltie/releases/latest/download/Boltie-macos-arm64.dmg)
- macOS, Intel: [Boltie-macos-x64.dmg](https://github.com/Abuhurera00/boltie/releases/latest/download/Boltie-macos-x64.dmg)

All versions are on the [releases page](https://github.com/Abuhurera00/boltie/releases). macOS 11 or newer.

The builds aren't signed yet, so the first launch needs one extra step:

- Windows: SmartScreen says "Windows protected your PC". Click "More info", then "Run anyway".
- macOS: drag Boltie to Applications. If macOS says the app is damaged or can't be checked, run `xattr -dr com.apple.quarantine /Applications/Boltie.app` once, or allow it under System Settings > Privacy & Security.

On macOS he lives in the menu bar, not the Dock.

## Brains

Pick one in settings:

- **Your Claude Code login.** If `claude` is installed and logged in, Boltie runs it in headless mode. No key needed. When Claude Code wants to do something that needs permission, you get an approval card. If you allow it, Boltie runs that exact command and hands the result back.
- **Anthropic API key.** Boltie runs its own tool loop against the Messages API (`claude-opus-5-5`, effort `low` by default). The key lives in your OS keychain. If Claude Code is installed, big coding jobs get handed to it.

Boltie never reads Claude Code's credential files.

## What he can do

| tool | asks first? |
|---|---|
| find a folder by name | no |
| open a folder or file in your editor | no |
| launch an app | no |
| run a command | only if it changes something |
| start a Docker container | yes |
| scaffold a project (Next.js, Vite, Rust, Python) | yes |
| hand a coding job to Claude Code | yes |

How the command check works is in `crates/boltie-core/src/policy.rs`, tests included.

**Skills** are markdown files with a few steps, like `skills/redis-stack.md`. Put your own in `%APPDATA%\boltie\skills` (Windows), `~/Library/Application Support/boltie/skills` (macOS) or `~/.config/boltie/skills` (Linux).

## Using him

- drag him anywhere on the screen. He stays at that height and drifts around from there
- with two screens he roams: flies across now and then, and the hotkey brings him to the screen your cursor is on. To keep him on one screen, right-click him > Screen, or pick it in settings
- right-click him for settings, "fly back down", hide or quit
- on the permission card `Y` allows and `N` or `Esc` declines. Destructive actions need a real click

## Build it

Needs Rust 1.80+, Node 22 and pnpm.

```
pnpm install
pnpm dev          # desktop app
pnpm web          # landing page
cargo test --workspace
pnpm build        # installers for the OS you're on, in target/release/bundle
```

On macOS you also need the Xcode command line tools (`xcode-select --install`).

To publish a release, push a tag like `v0.1.0`. GitHub Actions builds the Windows and macOS installers and attaches them to the release with the names linked above.

## Repo layout

```
crates/boltie-core   agent loop, tools, safety policy, providers (no Tauri)
apps/desktop         Tauri 2 app, three.js robot, the card UI
apps/web             landing page (Next.js static export)
skills/              skills that ship with the app
vault/               project notes, open it in Obsidian
```

Start with `vault/Home.md` if you want to know why things are the way they are.

## Credits

- UI, motion and sounds follow [Poupou](https://github.com/abuhurera00/poupou). The sounds are generated from sine waves by its `gen-sounds.mjs` (MIT).
- Not affiliated with Anthropic.

MIT licensed.
