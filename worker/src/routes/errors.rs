/* routes/errors.rs - one error shape for the whole JSON API.
Genlook answers errors as `{code,message,status}`; we mirror it so the shop
has exactly one parser and a code to branch on (`INSUFFICIENT_CREDITS` on a
refunded try-on, `UNAUTHORIZED` on an expired owner token, ...). */
use serde_json::{json, Value};
use worker::{Response, Result};

/// The error body. Pure + tested.
pub fn error_body(code: &str, message: &str, status: u16) -> Value {
    json!({ "code": code, "message": message, "status": status })
}

/// A JSON error with the matching HTTP status (never a plain-text 500 for
/// something the client can fix).
pub fn json_error(status: u16, code: &str, message: &str) -> Result<Response> {
    Response::from_json(&error_body(code, message, status)).map(|r| r.with_status(status))
}

/// Shorthand for the guards that keep repeating.
pub fn unauthorized() -> Result<Response> {
    json_error(401, "UNAUTHORIZED", "owner token required")
}

pub fn not_configured(what: &str) -> Result<Response> {
    json_error(500, "NOT_CONFIGURED", what)
}

pub fn bad_request(code: &str, message: &str) -> Result<Response> {
    json_error(400, code, message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn body_matches_genlook_error_shape() {
        let b = error_body("INSUFFICIENT_CREDITS", "Top up", 402);
        assert_eq!(b["code"], "INSUFFICIENT_CREDITS");
        assert_eq!(b["message"], "Top up");
        assert_eq!(b["status"], 402);
    }
}
