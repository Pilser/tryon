use worker::{Response, Result};

/// `/healthz` payload.
pub fn payload() -> &'static str {
    r#"{"ok":true}"#
}

/// `/healthz` response (kept in the route module so `lib.rs` stays router-only).
pub fn response() -> Result<Response> {
    Response::ok(payload())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payload_is_json_ok() {
        assert!(payload().contains("\"ok\":true"));
    }
}
