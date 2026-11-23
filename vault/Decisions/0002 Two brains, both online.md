# 0002 Two brains, both online

status: accepted
date: 2026-11-18

why we had to decide
- people either have an Anthropic API key or they already use Claude Code with a subscription. we want both groups to be running in a minute.
- local models (Ollama) were considered and dropped: multi-GB downloads and weak tool use. not worth it for v0.

what we picked
- `anthropic_api`: our own tool loop over the Messages API. default model `claude-opus-5-5` at effort `low`, which keeps desktop chores fast. refusal fallbacks on.
- `claude_cli`: run the user's own `claude -p` and read `stream-json`. no key needed.
- the API brain can still hand big coding jobs to Claude Code through the `delegate_to_claude_code` tool when it's installed.

what we gave up
- offline use
- in CLI mode Boltie's own tools (open_app, docker_run...) aren't available to Claude Code yet. it uses its shell instead. fixing that means exposing our tools over MCP, it's on the [[Roadmap]].

rules
- never read Claude Code's credential files. we only start the binary the user installed.
