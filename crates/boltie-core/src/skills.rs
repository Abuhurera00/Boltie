//! Skills are plain markdown files that teach Boltie a routine.
//!
//! ```markdown
//! ---
//! name: morning-setup
//! description: Start my usual dev environment
//! ---
//! 1. Open Docker Desktop if it isn't running.
//! 2. Start the `redis-stack` container.
//! 3. Open the my-app folder in VS Code.
//! ```
//!
//! The body is handed to the model as instructions. Skills never get extra
//! permissions: every step still goes through the same policy and approvals.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub body: String,
    pub path: PathBuf,
}

/// Load every `*.md` skill in the given directories. Later directories win on
/// name clashes, so user skills can override bundled ones.
pub fn load_all(dirs: &[PathBuf]) -> Vec<Skill> {
    let mut skills: Vec<Skill> = Vec::new();
    for dir in dirs {
        let Ok(entries) = fs::read_dir(dir) else { continue };
        let mut paths: Vec<PathBuf> = entries
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.extension().is_some_and(|ext| ext == "md"))
            .collect();
        paths.sort();
        for path in paths {
            match load(&path) {
                Some(skill) => {
                    skills.retain(|s| s.name != skill.name);
                    skills.push(skill);
                }
                None => tracing::warn!("skipping skill without front matter: {}", path.display()),
            }
        }
    }
    skills
}

pub fn load(path: &Path) -> Option<Skill> {
    let text = fs::read_to_string(path).ok()?;
    parse(&text, path)
}

fn parse(text: &str, path: &Path) -> Option<Skill> {
    let text = text.trim_start_matches('\u{feff}');
    let rest = text.strip_prefix("---")?;
    let end = rest.find("\n---")?;
    let header = &rest[..end];
    let body = rest[end + 4..].trim().to_string();

    let mut name = None;
    let mut description = String::new();
    for line in header.lines() {
        let Some((key, value)) = line.split_once(':') else { continue };
        let value = value.trim().trim_matches('"').to_string();
        match key.trim() {
            "name" => name = Some(value),
            "description" => description = value,
            _ => {}
        }
    }

    let name = name.or_else(|| path.file_stem().map(|s| s.to_string_lossy().into_owned()))?;
    if body.is_empty() {
        return None;
    }
    Some(Skill { name, description, body, path: path.to_path_buf() })
}

/// The block of text appended to the system prompt.
pub fn prompt_section(skills: &[Skill]) -> String {
    if skills.is_empty() {
        return String::new();
    }
    let mut out = String::from(
        "\n\n<skills>\nThe user has saved these routines. When a request matches one, follow its steps \
         using your tools. Steps still need approval like any other action.\n",
    );
    for skill in skills {
        out.push_str(&format!(
            "\n<skill name=\"{}\" description=\"{}\">\n{}\n</skill>\n",
            skill.name, skill.description, skill.body
        ));
    }
    out.push_str("</skills>");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_front_matter() {
        let skill = parse(
            "---\nname: morning\ndescription: \"Start my day\"\n---\n\n1. Open Docker\n",
            Path::new("x.md"),
        )
        .unwrap();
        assert_eq!(skill.name, "morning");
        assert_eq!(skill.description, "Start my day");
        assert_eq!(skill.body, "1. Open Docker");
    }

    #[test]
    fn falls_back_to_file_name() {
        let skill = parse("---\ndescription: hi\n---\nbody", Path::new("dir/redis.md")).unwrap();
        assert_eq!(skill.name, "redis");
    }

    #[test]
    fn rejects_files_without_front_matter() {
        assert!(parse("just some notes", Path::new("a.md")).is_none());
        assert!(parse("---\nname: empty\n---\n", Path::new("a.md")).is_none());
    }

    #[test]
    fn later_dirs_override_earlier_ones() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        fs::write(a.path().join("x.md"), "---\nname: x\n---\nbundled").unwrap();
        fs::write(b.path().join("x.md"), "---\nname: x\n---\nmine").unwrap();
        let skills = load_all(&[a.path().into(), b.path().into()]);
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].body, "mine");
    }
}
