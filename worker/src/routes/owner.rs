use serde::{Deserialize, Serialize};

/// Login body for `POST /api/owner/login`. Stateless: the browser keeps
/// the token and sends it as `Bearer` on studio calls; logout just clears
/// it client-side (`POST /api/owner/logout` is a no-op ack).
#[derive(Deserialize)]
pub struct LoginIn {
    pub token: String,
}

#[derive(Serialize)]
pub struct LoginOut {
    pub ok: bool,
}

/// Token check. Empty expected = open v1 backend (same rule as
/// `studio::authorized`), so local dev works before secrets exist.
pub fn login_ok(provided: &str, expected: &str) -> bool {
    expected.is_empty() || provided == expected
}

/// Strip the `Bearer ` scheme from an Authorization header value.
pub fn bearer_of(header: Option<&str>) -> &str {
    match header {
        Some(h) => h.strip_prefix("Bearer ").unwrap_or(""),
        None => "",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_matching_token_and_open_backend() {
        assert!(login_ok("s3cret", "s3cret"));
        assert!(!login_ok("nope", "s3cret"));
        assert!(login_ok("", ""));
        assert!(login_ok("anything", ""));
    }

    #[test]
    fn strips_bearer_scheme() {
        assert_eq!(bearer_of(Some("Bearer abc")), "abc");
        assert_eq!(bearer_of(Some("abc")), "");
        assert_eq!(bearer_of(None), "");
    }
}
