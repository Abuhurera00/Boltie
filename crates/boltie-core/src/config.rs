use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::{Error, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    /// Boltie runs its own tool loop against the Messages API.
    AnthropicApi,
    /// Boltie hands the whole request to the user's installed `claude` CLI.
    ClaudeCli,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub provider: ProviderKind,
    pub model: String,
    /// `low` keeps simple desktop commands snappy. Raise it for heavier work.
    pub effort: String,
    /// Where `find_folder` looks. Empty means "pick sensible defaults".
    pub project_roots: Vec<PathBuf>,
    /// Command used to open folders and files in an editor.
    pub editor: String,
    pub hotkey: String,
    pub command_timeout_secs: u64,
    /// When the API provider may hand big jobs to Claude Code.
    pub allow_claude_code_delegation: bool,
    /// Tools Claude Code may use without asking when Boltie delegates to it.
    pub claude_cli_allowed_tools: Vec<String>,
    /// Display Boltie stays on, by OS name. `None` lets him roam all displays.
    pub screen: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            provider: ProviderKind::AnthropicApi,
            model: "claude-opus-5-5".into(),
            effort: "low".into(),
            project_roots: Vec::new(),
            editor: "code".into(),
            hotkey: "CommandOrControl+Shift+Space".into(),
            command_timeout_secs: 120,
            allow_claude_code_delegation: true,
            claude_cli_allowed_tools: default_cli_tools(),
            screen: None,
        }
    }
}

/// File tools plus a few build commands. Claude Code names its shell tool
/// "PowerShell" on Windows and "Bash" elsewhere, so allow both spellings.
fn default_cli_tools() -> Vec<String> {
    let mut tools: Vec<String> = ["Read", "Glob", "Grep", "Edit", "Write"].into_iter().map(String::from).collect();
    let commands = [
        "npm install:*", "npm run:*", "npx:*", "pnpm:*", "cargo build:*", "cargo check:*", "cargo test:*",
        "git status:*", "git diff:*", "git log:*", "docker ps:*",
    ];
    for shell in ["Bash", "PowerShell"] {
        tools.extend(commands.iter().map(|c| format!("{shell}({c})")));
    }
    tools
}

impl Config {
    pub fn dir() -> Result<PathBuf> {
        dirs::config_dir()
            .map(|d| d.join("boltie"))
            .ok_or_else(|| Error::Config("could not find a config directory for this OS".into()))
    }

    pub fn default_path() -> Result<PathBuf> {
        Ok(Self::dir()?.join("config.toml"))
    }

    /// Load from disk, falling back to defaults when the file doesn't exist yet.
    pub fn load(path: &Path) -> Result<Self> {
        match fs::read_to_string(path) {
            Ok(text) => toml::from_str(&text).map_err(|e| Error::Config(format!("{}: {e}", path.display()))),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(e.into()),
        }
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let text = toml::to_string_pretty(self).map_err(|e| Error::Config(e.to_string()))?;
        // Write then rename so a crash never leaves half a config file.
        let tmp = path.with_extension("toml.tmp");
        fs::write(&tmp, text)?;
        fs::rename(tmp, path)?;
        Ok(())
    }

    /// Project roots that actually exist, with defaults filled in.
    pub fn search_roots(&self) -> Vec<PathBuf> {
        if !self.project_roots.is_empty() {
            return self.project_roots.iter().filter(|p| p.is_dir()).cloned().collect();
        }
        let mut roots = Vec::new();
        if let Some(home) = dirs::home_dir() {
            for name in ["projects", "code", "dev", "src", "repos", "work", "Desktop", "Documents"] {
                let dir = home.join(name);
                if dir.is_dir() {
                    roots.push(dir);
                }
            }
            roots.push(home);
        }
        // Windows devs often keep code on a second drive.
        if cfg!(windows) {
            for letter in ['D', 'E', 'F'] {
                let drive = PathBuf::from(format!("{letter}:\\"));
                if drive.is_dir() {
                    roots.push(drive);
                }
            }
        }
        roots
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_file_gives_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = Config::load(&dir.path().join("nope.toml")).unwrap();
        assert_eq!(cfg.provider, ProviderKind::AnthropicApi);
    }

    #[test]
    fn round_trips_and_tolerates_partial_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        fs::write(&path, "provider = \"claude_cli\"\n").unwrap();
        let mut cfg = Config::load(&path).unwrap();
        assert_eq!(cfg.provider, ProviderKind::ClaudeCli);
        assert_eq!(cfg.editor, "code");

        cfg.effort = "medium".into();
        cfg.save(&path).unwrap();
        assert_eq!(Config::load(&path).unwrap().effort, "medium");
    }
}
