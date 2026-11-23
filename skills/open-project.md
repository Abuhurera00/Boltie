---
name: open-project
description: Open a project by name in the editor
---
1. Use find_folder with the name the user said.
2. Prefer a match that looks like a project (has package.json, Cargo.toml, .git and so on). Check with a read-only listing if unsure.
3. Open it with open_in_editor.
4. If nothing matches, say which folders you searched and ask where it lives.
