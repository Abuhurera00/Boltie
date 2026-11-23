use std::path::PathBuf;
use std::time::Duration;

use serde::Deserialize;

use super::{expand_home, is_plain_name, Plan, ToolContext, ToolOutput};
use crate::policy::Risk;
use crate::sys;

/// Generators can download a lot on first run.
const SCAFFOLD_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Template {
    Nextjs,
    ViteReact,
    Rust,
    Python,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Scaffold {
    pub template: Template,
    pub name: String,
    pub parent_dir: String,
}

impl Scaffold {
    /// Program and arguments. Every generator here runs without prompts.
    fn command(&self) -> (&'static str, Vec<String>) {
        let name = self.name.clone();
        match self.template {
            Template::Nextjs => ("npx", vec!["--yes".into(), "create-next-app@latest".into(), name, "--yes".into()]),
            Template::ViteReact => (
                "npm",
                vec!["create".into(), "vite@latest".into(), name, "--".into(), "--template".into(), "react-ts".into()],
            ),
            Template::Rust => ("cargo", vec!["new".into(), name]),
            Template::Python => ("uv", vec!["init".into(), name]),
        }
    }

    fn parent(&self) -> PathBuf {
        expand_home(&self.parent_dir)
    }

    fn validate(&self) -> Result<(), String> {
        if !is_plain_name(&self.name, &[]) {
            return Err(format!("`{}` is not a valid project name", self.name));
        }
        let parent = self.parent();
        if !parent.is_dir() {
            return Err(format!("{} does not exist", parent.display()));
        }
        if parent.join(&self.name).exists() {
            return Err(format!("{} already exists", parent.join(&self.name).display()));
        }
        Ok(())
    }

    pub fn plan(&self) -> Result<Plan, String> {
        self.validate()?;
        let (program, args) = self.command();
        Ok(Plan {
            risk: Risk::Change,
            reason: "creates a new project folder and installs dependencies".into(),
            title: "Create a new project".into(),
            detail: format!("{program} {}", args.join(" ")),
            cwd: Some(self.parent()),
        })
    }

    pub async fn execute(&self, _ctx: &ToolContext) -> ToolOutput {
        if let Err(e) = self.validate() {
            return ToolOutput::err(e);
        }
        let (program, args) = self.command();
        let Some(exe) = sys::which(program) else {
            return ToolOutput::err(format!("`{program}` is not installed or not on PATH"));
        };
        let mut cmd = sys::command(exe);
        cmd.args(&args).current_dir(self.parent());
        match sys::run(cmd, SCAFFOLD_TIMEOUT).await {
            Ok(out) if out.ok() => ToolOutput::ok(format!(
                "created {}\n{}",
                self.parent().join(&self.name).display(),
                out.for_model()
            )),
            Ok(out) => ToolOutput::err(out.for_model()),
            Err(e) => ToolOutput::err(format!("could not run {program}: {e}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plans_a_next_app() {
        let dir = tempfile::tempdir().unwrap();
        let call = Scaffold {
            template: Template::Nextjs,
            name: "demo".into(),
            parent_dir: dir.path().display().to_string(),
        };
        let plan = call.plan().unwrap();
        assert_eq!(plan.detail, "npx --yes create-next-app@latest demo --yes");
        assert_eq!(plan.risk, Risk::Change);
    }

    #[test]
    fn refuses_bad_names_and_existing_folders() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("taken")).unwrap();
        let parent = dir.path().display().to_string();
        for name in ["taken", "../escape", "a b", ""] {
            let call = Scaffold { template: Template::Rust, name: name.into(), parent_dir: parent.clone() };
            assert!(call.plan().is_err(), "{name:?}");
        }
    }
}
