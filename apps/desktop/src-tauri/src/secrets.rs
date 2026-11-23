//! The API key lives in the OS credential store (Windows Credential Manager,
//! macOS Keychain, Secret Service on Linux), never in the config file.

use keyring::Entry;

const SERVICE: &str = "dev.boltie.app";
const ACCOUNT: &str = "anthropic-api-key";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("credential store unavailable: {e}"))
}

pub fn api_key() -> Option<String> {
    match entry().ok()?.get_password() {
        Ok(key) if !key.trim().is_empty() => Some(key),
        Ok(_) => None,
        Err(keyring::Error::NoEntry) => None,
        Err(e) => {
            tracing::warn!("could not read API key: {e}");
            None
        }
    }
}

pub fn set_api_key(key: &str) -> Result<(), String> {
    entry()?.set_password(key.trim()).map_err(|e| e.to_string())
}

pub fn clear_api_key() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
