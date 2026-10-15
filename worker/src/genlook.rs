use serde::{Deserialize, Serialize};

#[derive(Debug, PartialEq)]
pub enum GenlookError {
    MissingKey,
    Http(String),
}

/// Minimal Genlook REST shapes. Real HTTP happens in Worker via `fetch`
/// (reqwest not used in Wasm worker to avoid Tokio). Testable offline.
#[derive(Clone, Debug)]
pub struct GenlookClient {
    pub base_url: String,
    pub api_key: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateTryOn {
    pub product_image_url: String,
    pub person_image_id: String,
    pub title: String,
}

impl GenlookClient {
    pub fn new(base_url: &str, api_key: &str) -> Result<Self, GenlookError> {
        if api_key.is_empty() {
            return Err(GenlookError::MissingKey);
        }
        Ok(Self {
            base_url: base_url.into(),
            api_key: api_key.into(),
        })
    }

    pub fn try_on_path(&self) -> String {
        format!("{}/try-on", self.base_url)
    }

    pub fn generation_path(&self, id: &str) -> String {
        format!("{}/generations/{}", self.base_url, id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_key() {
        assert!(matches!(
            GenlookClient::new("https://x", ""),
            Err(GenlookError::MissingKey)
        ));
    }

    #[test]
    fn builds_paths() {
        let c = GenlookClient::new("https://api.genlook.app", "k").unwrap();
        assert!(c.try_on_path().ends_with("/try-on"));
        assert!(c.generation_path("abc").ends_with("/generations/abc"));
    }
}
