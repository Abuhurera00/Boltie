use std::path::PathBuf;

use serde::Deserialize;

use super::{display_path, expand_home, is_plain_name, Plan, ToolContext, ToolOutput};
use crate::policy::Risk;
use crate::sys;

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OpenInEditor {
    pub path: String,
}

impl OpenInEditor {
    pub fn plan(&self, ctx: &ToolContext) -> Result<Plan, String> {
        let path = expand_home(&self.path);
        if !path.exists() {
            return Err(format!("{} does not exist. Use find_folder to locate it.", path.display()));
        }
        Ok(Plan {
            risk: Risk::ReadOnly,
            reason: "opens an editor window".into(),
            title: "Open in editor".into(),
            detail: format!("{} {}", ctx.config.editor, display_path(&path)),
            cwd: None,
        })
    }

    pub fn execute(&self, ctx: &ToolContext) -> ToolOutput {
        let path = expand_home(&self.path);
        let Some(editor) = sys::which(&ctx.config.editor) else {
            return ToolOutput::err(format!(
                "editor `{}` is not on PATH. In VS Code run \"Shell Command: Install 'code' command in PATH\".",
                ctx.config.editor
            ));
        };
        let arg = display_path(&path);
        match sys::spawn_detached(&editor, &[arg.as_str()], None) {
            Ok(()) => ToolOutput::ok(format!("opened {arg} in {}", ctx.config.editor)),
            Err(e) => ToolOutput::err(format!("could not start {}: {e}", editor.display())),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OpenApp {
    pub name: String,
}

/// How to launch an app on this OS.
#[derive(Debug, Clone, PartialEq)]
enum Launch {
    Exe(PathBuf, Vec<String>),
    /// Let the OS find it: Start-Process on Windows, `open -a` on macOS.
    ByName(String),
}

impl OpenApp {
    pub fn plan(&self) -> Result<Plan, String> {
        let launch = resolve(&self.name)?;
        let detail = match &launch {
            Launch::Exe(p, args) => format!("{} {}", p.display(), args.join(" ")).trim().to_string(),
            Launch::ByName(n) => n.clone(),
        };
        Ok(Plan {
            risk: Risk::ReadOnly,
            reason: "launches an application".into(),
            title: format!("Open {}", self.name.trim()),
            detail,
            cwd: None,
        })
    }

    pub fn execute(&self, ctx: &ToolContext) -> ToolOutput {
        let launch = match resolve(&self.name) {
            Ok(l) => l,
            Err(e) => return ToolOutput::err(e),
        };
        let result = match &launch {
            Launch::Exe(path, args) => {
                let args: Vec<&str> = args.iter().map(String::as_str).collect();
                sys::spawn_detached(path, &args, None)
            }
            Launch::ByName(name) => launch_by_name(ctx, name),
        };
        match result {
            Ok(()) => ToolOutput::ok(format!("launched {}", self.name.trim())),
            Err(e) => ToolOutput::err(format!("could not launch {}: {e}", self.name.trim())),
        }
    }
}

fn resolve(raw: &str) -> Result<Launch, String> {
    let name = raw.trim().to_lowercase();
    let alias = match name.as_str() {
        "vscode" | "vs code" | "visual studio code" | "code" => "code",
        "docker" | "docker desktop" => "docker-desktop",
        "terminal" | "windows terminal" | "console" => "terminal",
        "explorer" | "file explorer" | "files" | "finder" => "files",
        "browser" | "chrome" | "google chrome" => "chrome",
        other => other,
    };

    if alias == "code" {
        if let Some(code) = sys::which("code") {
            return Ok(Launch::Exe(code, vec![]));
        }
    }

    if cfg!(windows) {
        match alias {
            "docker-desktop" => {
                let base = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".into());
                let exe = PathBuf::from(base).join(r"Docker\Docker\Docker Desktop.exe");
                return if exe.is_file() {
                    Ok(Launch::Exe(exe, vec![]))
                } else {
                    Err("Docker Desktop is not installed in the default location".into())
                };
            }
            "terminal" => return Ok(Launch::ByName("wt".into())),
            "files" => return Ok(Launch::Exe(PathBuf::from("explorer.exe"), vec![])),
            _ => {}
        }
    } else if cfg!(target_os = "macos") {
        match alias {
            "docker-desktop" => return Ok(Launch::ByName("Docker".into())),
            "terminal" => return Ok(Launch::ByName("Terminal".into())),
            "files" => return Ok(Launch::ByName("Finder".into())),
            "chrome" => return Ok(Launch::ByName("Google Chrome".into())),
            _ => {}
        }
    } else {
        match alias {
            "docker-desktop" => return Ok(Launch::ByName("docker-desktop".into())),
            "terminal" => return Ok(Launch::ByName("x-terminal-emulator".into())),
            "files" => return Ok(Launch::Exe(PathBuf::from("xdg-open"), vec![".".into()])),
            "chrome" => return Ok(Launch::ByName("google-chrome".into())),
            _ => {}
        }
    }

    // Anything else is passed to the OS launcher by name, so it must be a
    // plain name and not a path or something with shell syntax in it.
    let cleaned = raw.trim();
    if !is_plain_name(cleaned, &[' ']) {
        return Err(format!("`{cleaned}` doesn't look like an app name"));
    }
    Ok(Launch::ByName(cleaned.to_string()))
}

fn launch_by_name(ctx: &ToolContext, name: &str) -> std::io::Result<()> {
    if cfg!(windows) {
        // Start-Process resolves App Paths (chrome, msedge, spotify, ...). The
        // name was checked by `is_plain_name`, so single quotes are safe.
        let script = format!("Start-Process '{name}'");
        let mut args: Vec<&str> = ctx.shell.args.clone();
        args.push(&script);
        sys::spawn_detached(&ctx.shell.program, &args, None)
    } else if cfg!(target_os = "macos") {
        sys::spawn_detached(&PathBuf::from("open"), &["-a", name], None)
    } else {
        match sys::which(name) {
            Some(exe) => sys::spawn_detached(&exe, &[], None),
            None => sys::spawn_detached(&PathBuf::from("gtk-launch"), &[name], None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_paths_and_shell_syntax() {
        assert!(resolve("C:\\evil.exe").is_err());
        assert!(resolve("calc; rm -rf ~").is_err());
        assert!(resolve("notepad'").is_err());
    }

    #[test]
    fn plain_names_are_launched_by_name() {
        assert_eq!(resolve("Spotify").unwrap(), Launch::ByName("Spotify".into()));
    }
}
