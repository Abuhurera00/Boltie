# 0004 Ask before changing anything

status: accepted
date: 2026-11-18

why we had to decide
- a voice-driven agent with a shell is the scary part of this app. trust is the feature.

what we picked
- every tool call becomes a plan first: exact command, working folder, risk level
- read-only runs without asking. change and destructive need a click. forbidden never runs, the user isn't even asked.
- the classifier (`policy.rs`) is a heuristic and leans toward asking. unknown commands count as changes.
- escape or N declines the card. Y allows, but never for destructive actions, those need a real click.
- typed tools (docker_run, scaffold_project) build argument lists themselves, no shell, and validate every field. that's why they exist next to run_command.

claude code specifics
- runs with `--permission-prompts none` so it never hangs on a prompt nobody sees
- denials come back in the result, become approval cards, then we resume the session
- for approved shell commands Boltie runs the command itself and passes the output back. allow-listing wasn't enough, claude code still blocks `$(...)` in headless mode. see [[Claude Code headless]].

what we gave up
- some friction. a "trust this folder" option can come later, per folder, never global.
