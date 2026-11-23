//! Minimal Messages API client.
//!
//! There's no official Anthropic SDK for Rust, so this talks HTTP directly. It
//! covers exactly what Boltie needs: one non-streaming request with tools,
//! retries on overload, and nothing else.
//!
//! Content blocks are kept as raw JSON on purpose. The API expects assistant
//! turns to be sent back unchanged (thinking blocks included), and keeping them
//! as `Value` means we never drop a field we don't model.

use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::{Error, Result};

const API_URL: &str = "https://api.anthropic.com/v1/messages";
const API_VERSION: &str = "2026-10-21";
const FALLBACK_BETA: &str = "server-side-fallback-2026-07-01";
const MAX_TOKENS: u32 = 16_000;
const MAX_ATTEMPTS: u32 = 3;

pub struct Client {
    http: reqwest::Client,
    api_key: String,
    url: String,
}

pub struct Request<'a> {
    pub model: &'a str,
    pub effort: &'a str,
    pub system: &'a str,
    pub tools: &'a [Value],
    pub messages: &'a [Value],
}

#[derive(Debug, Clone, Deserialize)]
pub struct Response {
    pub content: Vec<Value>,
    pub stop_reason: Option<String>,
    #[serde(default)]
    pub model: String,
}

impl Response {
    pub fn text(&self) -> String {
        self.content
            .iter()
            .filter(|b| b["type"] == "text")
            .filter_map(|b| b["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string()
    }

    pub fn tool_uses(&self) -> impl Iterator<Item = &Value> {
        self.content.iter().filter(|b| b["type"] == "tool_use")
    }
}

#[derive(Deserialize)]
struct ErrorBody {
    error: ErrorDetail,
}

#[derive(Deserialize)]
struct ErrorDetail {
    message: String,
}

impl Client {
    pub fn new(api_key: impl Into<String>) -> Result<Self> {
        let api_key = api_key.into();
        if api_key.trim().is_empty() {
            return Err(Error::MissingApiKey);
        }
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(300))
            .user_agent(concat!("boltie/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self { http, api_key: api_key.trim().to_string(), url: API_URL.to_string() })
    }

    #[cfg(test)]
    fn with_url(mut self, url: &str) -> Self {
        self.url = url.to_string();
        self
    }

    pub fn body(req: &Request<'_>) -> Value {
        let mut body = json!({
            "model": req.model,
            "max_tokens": MAX_TOKENS,
            "system": req.system,
            "tools": req.tools,
            "messages": req.messages,
            "output_config": { "effort": req.effort },
            // Caches the stable prefix (tools + system) between turns.
            "cache_control": { "type": "ephemeral" },
        });
        if supports_fallbacks(req.model) {
            body["fallbacks"] = json!("default");
        }
        body
    }

    pub async fn create(&self, req: &Request<'_>) -> Result<Response> {
        let body = Self::body(req);
        let mut attempt = 0;
        loop {
            attempt += 1;
            let mut builder = self
                .http
                .post(&self.url)
                .header("x-api-key", &self.api_key)
                .header("anthropic-version", API_VERSION)
                .json(&body);
            if supports_fallbacks(req.model) {
                builder = builder.header("anthropic-beta", FALLBACK_BETA);
            }

            let response = match builder.send().await {
                Ok(r) => r,
                Err(e) if attempt < MAX_ATTEMPTS && (e.is_connect() || e.is_timeout()) => {
                    tokio::time::sleep(backoff(attempt, None)).await;
                    continue;
                }
                Err(e) => return Err(e.into()),
            };

            let status = response.status().as_u16();
            if response.status().is_success() {
                return Ok(response.json::<Response>().await?);
            }

            let retry_after = response
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok());
            let should_retry = response
                .headers()
                .get("x-should-retry")
                .and_then(|v| v.to_str().ok())
                .map(|v| v == "true")
                .unwrap_or(status == 429 || status == 529 || status >= 500);
            let text = response.text().await.unwrap_or_default();

            if status == 401 {
                return Err(Error::BadApiKey);
            }
            if should_retry && attempt < MAX_ATTEMPTS {
                tracing::warn!(status, attempt, "anthropic request failed, retrying");
                tokio::time::sleep(backoff(attempt, retry_after)).await;
                continue;
            }
            let message = serde_json::from_str::<ErrorBody>(&text)
                .map(|b| b.error.message)
                .unwrap_or(text);
            return Err(Error::Api { status, message });
        }
    }
}

/// Server-side refusal fallbacks exist on the Opus 5 / Fable 5 lines and
/// Sonnet 5.5. Sending the parameter to other models is a 400.
fn supports_fallbacks(model: &str) -> bool {
    ["claude-opus-5", "claude-fable-5", "claude-sonnet-5-5"]
        .iter()
        .any(|prefix| model.starts_with(prefix))
}

fn backoff(attempt: u32, retry_after: Option<u64>) -> Duration {
    match retry_after {
        Some(secs) => Duration::from_secs(secs.min(30)),
        None => Duration::from_millis(500 * 2u64.pow(attempt)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn body_has_effort_caching_and_fallbacks() {
        let tools = vec![json!({"name": "t"})];
        let messages = vec![json!({"role": "user", "content": "hi"})];
        let body = Client::body(&Request {
            model: "claude-opus-5-5",
            effort: "low",
            system: "sys",
            tools: &tools,
            messages: &messages,
        });
        assert_eq!(body["output_config"]["effort"], "low");
        assert_eq!(body["fallbacks"], "default");
        assert_eq!(body["cache_control"]["type"], "ephemeral");
        assert!(body.get("thinking").is_none(), "Opus 5.5 always thinks; don't configure it");
    }

    #[test]
    fn no_fallbacks_for_models_without_them() {
        let body = Client::body(&Request { model: "claude-haiku-5-5", effort: "low", system: "", tools: &[], messages: &[] });
        assert!(body.get("fallbacks").is_none());
    }

    #[test]
    fn empty_key_is_rejected_early() {
        assert!(matches!(Client::new("  "), Err(Error::MissingApiKey)));
    }

    #[test]
    fn parses_tool_use_response() {
        let raw = json!({
            "id": "msg_1", "type": "message", "role": "assistant", "model": "claude-opus-5-5",
            "content": [
                {"type": "thinking", "thinking": "", "signature": "abc"},
                {"type": "text", "text": "Opening it."},
                {"type": "tool_use", "id": "toolu_1", "name": "open_app", "input": {"name": "docker"}}
            ],
            "stop_reason": "tool_use",
            "usage": {"input_tokens": 1, "output_tokens": 1}
        });
        let resp: Response = serde_json::from_value(raw).unwrap();
        assert_eq!(resp.text(), "Opening it.");
        assert_eq!(resp.tool_uses().count(), 1);
        // The thinking block must survive so it can be sent back unchanged.
        assert_eq!(resp.content[0]["signature"], "abc");
    }

    #[tokio::test]
    async fn unreachable_server_is_an_http_error() {
        let client = Client::new("sk-test").unwrap().with_url("http://127.0.0.1:9/v1/messages");
        let err = client
            .create(&Request { model: "claude-opus-5-5", effort: "low", system: "", tools: &[], messages: &[] })
            .await
            .unwrap_err();
        assert!(matches!(err, Error::Http(_)), "{err:?}");
    }
}
