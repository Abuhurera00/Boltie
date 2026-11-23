use std::time::Duration;

use serde::Deserialize;

use super::{is_plain_name, Plan, ToolOutput};
use crate::policy::Risk;
use crate::sys;

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DockerRun {
    pub image: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub ports: Vec<String>,
    #[serde(default)]
    pub env: Vec<String>,
    #[serde(default)]
    pub volumes: Vec<String>,
}

impl DockerRun {
    /// Arguments for `docker`, validated. We never go through a shell here.
    pub fn args(&self) -> Result<Vec<String>, String> {
        if !is_plain_name(&self.image, &['/', ':', '@']) {
            return Err(format!("`{}` is not a valid image reference", self.image));
        }
        let mut args = vec!["run".to_string(), "-d".to_string()];
        if let Some(name) = self.name.as_deref().filter(|n| !n.is_empty()) {
            if !is_plain_name(name, &[]) {
                return Err(format!("`{name}` is not a valid container name"));
            }
            args.extend(["--name".into(), name.into()]);
        }
        for port in &self.ports {
            let ok = !port.is_empty()
                && port.split(':').all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit() || c == '.' || c == '/' || c.is_ascii_lowercase()));
            if !ok {
                return Err(format!("`{port}` is not a valid port mapping"));
            }
            args.extend(["-p".into(), port.clone()]);
        }
        for var in &self.env {
            let Some((key, _)) = var.split_once('=') else {
                return Err(format!("env `{var}` must look like KEY=value"));
            };
            if !is_plain_name(key, &[]) || var.contains(['\n', '\r']) {
                return Err(format!("env `{var}` has an invalid name"));
            }
            args.extend(["-e".into(), var.clone()]);
        }
        for vol in &self.volumes {
            if vol.contains(['\n', '\r', '"', '\'']) || !vol.contains(':') {
                return Err(format!("`{vol}` is not a valid volume mapping"));
            }
            args.extend(["-v".into(), vol.clone()]);
        }
        args.push(self.image.clone());
        Ok(args)
    }

    pub fn plan(&self) -> Result<Plan, String> {
        let args = self.args()?;
        Ok(Plan {
            risk: Risk::Change,
            reason: "starts a container".into(),
            title: "Start a Docker container".into(),
            detail: format!("docker {}", args.join(" ")),
            cwd: None,
        })
    }

    pub async fn execute(&self, timeout: Duration) -> ToolOutput {
        let args = match self.args() {
            Ok(a) => a,
            Err(e) => return ToolOutput::err(e),
        };
        let Some(docker) = sys::which("docker") else {
            return ToolOutput::err("docker is not on PATH. Is Docker installed?");
        };
        let mut cmd = sys::command(docker);
        cmd.args(&args);
        match sys::run(cmd, timeout).await {
            Ok(out) if out.ok() => ToolOutput::ok(format!("container started\n{}", out.for_model())),
            Ok(out) => {
                let mut text = out.for_model();
                if text.contains("daemon") || text.contains("pipe/docker_engine") {
                    text.push_str("\nhint: Docker isn't running. Open it with open_app(\"docker\") and retry once `docker info` works.");
                }
                ToolOutput::err(text)
            }
            Err(e) => ToolOutput::err(format!("could not run docker: {e}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(image: &str) -> DockerRun {
        DockerRun { image: image.into(), name: None, ports: vec![], env: vec![], volumes: vec![] }
    }

    #[test]
    fn builds_redis_stack_args() {
        let mut call = run("redis/redis-stack:latest");
        call.name = Some("redis-stack".into());
        call.ports = vec!["6379:6379".into(), "8001:8001".into()];
        assert_eq!(
            call.plan().unwrap().detail,
            "docker run -d --name redis-stack -p 6379:6379 -p 8001:8001 redis/redis-stack:latest"
        );
    }

    #[test]
    fn rejects_injection_attempts() {
        assert!(run("redis; rm -rf ~").args().is_err());
        let mut call = run("redis");
        call.ports = vec!["6379:6379 --privileged".into()];
        assert!(call.args().is_err());
        let mut call = run("redis");
        call.env = vec!["$(whoami)=1".into()];
        assert!(call.args().is_err());
    }
}
