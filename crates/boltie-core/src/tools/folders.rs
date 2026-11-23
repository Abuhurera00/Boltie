use std::collections::VecDeque;
use std::fs;
use std::path::PathBuf;

use serde::Deserialize;

use super::{ToolContext, ToolOutput};

const MAX_DEPTH: usize = 4;
const MAX_DIRS_VISITED: usize = 40_000;
const MAX_RESULTS: usize = 8;

/// Directories that are never worth descending into.
const SKIP: &[&str] = &[
    "node_modules", "target", "dist", "build", ".next", ".git", ".cache", "__pycache__", ".venv",
    "venv", "vendor", "appdata", "library", "$recycle.bin", "system volume information", "windows",
    "program files", "program files (x86)", "programdata",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FindFolder {
    pub query: String,
}

impl FindFolder {
    pub async fn execute(&self, ctx: &ToolContext) -> ToolOutput {
        let roots = ctx.config.search_roots();
        let query = self.query.clone();
        let found = tokio::task::spawn_blocking(move || search(&roots, &query))
            .await
            .unwrap_or_default();
        if found.is_empty() {
            ToolOutput::ok(format!(
                "no folder matching \"{}\" found. Ask the user where it is, or suggest adding its parent to project roots in settings.",
                self.query
            ))
        } else {
            let list: Vec<String> = found.iter().map(|p| p.display().to_string()).collect();
            ToolOutput::ok(list.join("\n"))
        }
    }
}

/// `"My App"`, `"my-app"` and `"myapp"` should all match each other.
fn normalise(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect()
}

/// Breadth-first so shallow matches come first, ranked exact > prefix > contains.
pub fn search(roots: &[PathBuf], query: &str) -> Vec<PathBuf> {
    let needle = normalise(query);
    if needle.is_empty() {
        return Vec::new();
    }

    let mut matches: Vec<(u8, usize, PathBuf)> = Vec::new();
    let mut queue: VecDeque<(PathBuf, usize)> = roots.iter().map(|r| (r.clone(), 0)).collect();
    let mut seen = std::collections::HashSet::new();
    let mut visited = 0;

    while let Some((dir, depth)) = queue.pop_front() {
        visited += 1;
        if visited > MAX_DIRS_VISITED {
            break;
        }
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let Ok(kind) = entry.file_type() else { continue };
            if !kind.is_dir() || kind.is_symlink() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            let lower = name.to_lowercase();
            if lower.starts_with('.') || SKIP.contains(&lower.as_str()) {
                continue;
            }
            let path = entry.path();
            if !seen.insert(path.clone()) {
                continue;
            }

            let candidate = normalise(&name);
            let rank = if candidate == needle {
                Some(0)
            } else if candidate.starts_with(&needle) {
                Some(1)
            } else if candidate.contains(&needle) {
                Some(2)
            } else {
                None
            };
            if let Some(rank) = rank {
                matches.push((rank, depth, path.clone()));
            }
            if depth + 1 < MAX_DEPTH {
                queue.push_back((path, depth + 1));
            }
        }
    }

    matches.sort_by_key(|a| (a.0, a.1, a.2.as_os_str().len()));
    matches.dedup_by(|a, b| a.2 == b.2);
    matches.into_iter().take(MAX_RESULTS).map(|(_, _, p)| p).collect()
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_folders_by_loose_name() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("work/My-App")).unwrap();
        fs::create_dir_all(root.path().join("work/myapp-old/node_modules/myapp")).unwrap();
        fs::create_dir_all(root.path().join("other")).unwrap();

        let found = search(&[root.path().to_path_buf()], "my app");
        assert_eq!(found.len(), 2, "{found:?}");
        assert!(found[0].ends_with("My-App"), "exact match should come first: {found:?}");
        assert!(!found.iter().any(|p| p.to_string_lossy().contains("node_modules")));
    }

    #[test]
    fn empty_query_finds_nothing() {
        let root = tempfile::tempdir().unwrap();
        assert!(search(&[root.path().to_path_buf()], "  -- ").is_empty());
    }
}
