# Claude Code headless

checked against `claude` 2.1.327 on Windows, 2026-11-18

flags we use
- `-p` print mode, prompt comes from stdin (avoids escaping problems with `.cmd` shims on Windows)
- `--output-format stream-json --verbose` one JSON object per line
- `--permission-prompts none` anything that would prompt is denied instead
- `--allowedTools a,b,c` what may run without asking
- `--append-system-prompt` tells it to answer in one or two sentences for the bubble
- `--resume <session_id>` continue after the user approves something

what the stream looked like in a real run
- several `system` messages first (hook_started, hook_response, init, commands_changed)
- `assistant` with `tool_use`, then `user` with `tool_result`, also `thinking` blocks and a `rate_limit_event`
- last line `result` with `subtype`, `is_error`, `result` (final text), `session_id`, `permission_denials`
- every message carries `session_id`

gotchas
- on Windows the shell tool is called `PowerShell`, not `Bash`. allow rules and denials must handle both names
- commands with `$(...)` are refused in headless mode even when the exact command is allow-listed. so after the user approves, Boltie runs the command and resumes with the output. see [[0004 Ask before changing anything]]
- the user's own settings apply (hooks, permissions). read-only commands like `docker ps` may already be allowed there
