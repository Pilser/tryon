use serde::{Deserialize, Serialize};
use worker::{Env, Request, Response, Result};

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

/// The owner token this deployment expects (empty = open local backend).
pub fn env_token(env: &Env) -> String {
    env.var("OWNER_TOKEN")
        .map(|v| v.to_string())
        .unwrap_or_default()
}

/// Async owner gate: accepts either the OWNER_TOKEN (existing) OR a valid
/// platform session cookie (SSO from latiforge.com). Empty OWNER_TOKEN =
/// open local backend (preserves dev ergonomics).
pub async fn authorized_async(req: &Request, env: &Env) -> bool {
    // 1. Legacy OWNER_TOKEN check.
    let expected = env_token(env);
    let provided = req
        .headers()
        .get("authorization")
        .ok()
        .flatten()
        .unwrap_or_default();
    if crate::routes::studio::authorized(Some(&provided), &expected) {
        return true;
    }
    // 2. Platform session cookie (SSO).
    if let Some(cookie_val) = cookie(req, "tryon_session") {
        if crate::routes::platform::verify_platform_session(env, &cookie_val).await {
            return true;
        }
    }
    // Open backend (no token set) still passes.
    expected.is_empty()
}

fn cookie(req: &Request, name: &str) -> Option<String> {
    let raw = req.headers().get("cookie").ok().flatten()?;
    for part in raw.split(';') {
        let part = part.trim();
        if let Some((k, v)) = part.split_once('=') {
            if k.trim() == name {
                return Some(v.trim().to_string());
            }
        }
    }
    None
}

/// `POST /api/owner/login` — verify the submitted token.
pub async fn handle_login(mut req: Request, env: Env) -> Result<Response> {
    let input: LoginIn = req
        .json()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    if login_ok(input.token.trim(), &env_token(&env)) {
        Response::from_json(&LoginOut { ok: true })
    } else {
        crate::routes::errors::json_error(401, "UNAUTHORIZED", "bad token")
    }
}

/// `GET /api/owner/sso` — checks if a valid platform session cookie is
/// present and the user is approved. Returns {ok:true} on success.
pub async fn handle_sso(req: Request, env: Env) -> Result<Response> {
    if authorized_async(&req, &env).await {
        Response::from_json(&LoginOut { ok: true })
    } else {
        crate::routes::errors::unauthorized()
    }
}
pub async fn handle_logout() -> Result<Response> {
    Response::from_json(&LoginOut { ok: true })
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
