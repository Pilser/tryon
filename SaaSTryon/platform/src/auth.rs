/* auth.rs - token-card auth, no passwords (§7.6, mirrors the shop's
OWNER_TOKEN pattern). Signup leaves the user `pending`; admin approval
mints a `plat_<16hex>` one-shot signin token whose SHA-256 hex only is
stored (`users.auth_hash`). The user presents the token at /api/v1/login
and receives a session (`sessions` row in D1) bound to the token; `/me`
verifies via the Bearer session. */
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use worker::d1::D1Database;
use worker::{Env, Error, Headers, Request, Response, Result};

use crate::{cfg, http, store};

pub const TOKEN_PREFIX: &str = "plat-";
/// How many readable characters a minted signin token carries.
const TOKEN_CHARS: usize = 8;
/// Session lifetime: 30 days.
pub const SESSION_TTL_MS: i64 = 30 * 24 * 60 * 60 * 1000;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Session {
    pub id: String,
    pub user_id: String,
    pub created_ms: i64,
    pub expires_ms: i64,
}

/// Random hex string of `n` bytes (crypto.getRandomValues on wasm).
pub fn random_hex(n_bytes: usize) -> String {
    let mut buf = vec![0u8; n_bytes];
    getrandom::getrandom(&mut buf).expect("secure rng unavailable");
    hex::encode(buf)
}

/// A fresh signin token — shown ONCE, in the admin UI, at approval time.
///
/// It is READABLE on purpose: the owner types it into the login form,
/// so it is `plat-` plus eight characters from an alphabet without
/// 0/O/1/I (no "is that a zero or an O?"). The admin can also set the
/// token by hand (POST /api/v1/admin/users/{id}/token).
pub fn new_token() -> String {
    format!("{TOKEN_PREFIX}{}", random_typable(TOKEN_CHARS))
}

/// `n` characters from an alphabet a human can type without a second
/// look: no 0/O, no 1/I/l. Used for the shop's studio token, which the
/// owner types into their dashboard.
pub fn random_typable(n: usize) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut buf = vec![0u8; n];
    getrandom::getrandom(&mut buf).expect("secure rng unavailable");
    buf.iter()
        .map(|b| ALPHABET[(*b as usize) % ALPHABET.len()] as char)
        .collect()
}

/// SHA-256 of the raw token, hex — the only thing stored server-side.
pub fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

pub fn session_expired(expires_ms: i64, now_ms: i64) -> bool {
    now_ms >= expires_ms
}

/// Current time in ms as the Workers runtime sees it (`Date.now`).
pub fn now_ms() -> i64 {
    worker::Date::now().as_millis() as i64
}

/// Strip the `Bearer ` scheme from an Authorization header (or None).
pub fn bearer(headers: &Headers) -> Option<String> {
    headers
        .get("authorization")
        .ok()
        .flatten()
        .and_then(|v| v.strip_prefix("Bearer ").map(|t| t.trim().to_string()))
}

/// Login step: hash the presented plat_ token, look up its owner.
async fn user_by_token(db: &D1Database, raw_token: &str) -> Result<Option<store::UserRow>> {
    store::user_by_auth_hash(db, &hash_token(raw_token)).await
}

/// Verify a Bearer session token against D1: only non-expired sessions
/// verify; the session's user existence is checked by callers.
pub async fn verify_session(db: &D1Database, headers: &Headers) -> Result<Option<Session>> {
    let Some(id) = bearer(headers) else {
        return Ok(None);
    };
    let Some(s) = store::session_by_id(db, &id).await? else {
        return Ok(None);
    };
    if session_expired(s.expires_ms, now_ms()) {
        let _ = store::delete_session(db, &id).await; // cleanup best-effort
        return Ok(None);
    }
    Ok(Some(s))
}

/// Issue a fresh session for an approved user (login).
async fn create_login_session(db: &D1Database, user_id: &str) -> Result<Session> {
    let now = now_ms();
    let s = Session {
        id: crate::store::new_id("sess"),
        user_id: user_id.to_string(),
        created_ms: now,
        expires_ms: now + SESSION_TTL_MS,
    };
    store::insert_session(db, &s).await?;
    Ok(s)
}

/// `POST /api/v1/signup {email, contact, shop_name?}` — creates a
/// `pending` user; approval (admin) is the only path forward.
pub async fn signup(env: worker::Env, req: &mut worker::Request) -> Result<Response> {
    let Some(body) = http::json_body::<SignupIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {email, contact, shop_name?}");
    };
    let email = body.email.trim().to_lowercase();
    if !cfg::valid_email(&email) {
        return http::bad_request("BAD_EMAIL", "email does not look deliverable");
    }
    let contact = cfg::normalise_contact(&body.contact);
    if !cfg::valid_contact(&contact) {
        return http::bad_request("BAD_CONTACT", "contact needs 7-20 digits");
    }
    let shop_name = body.shop_name.unwrap_or_default().trim().to_string();
    if shop_name.len() > 80 {
        return http::bad_request("BAD_SHOP_NAME", "shop_name too long (max 80)");
    }
    let db = store::db(&env)?;
    if store::user_by_email(&db, &email).await?.is_some() {
        return http::json_error(409, "EMAIL_TAKEN", "that email already signed up");
    }
    let id = store::new_id("usr");
    let created = now_ms();
    store::insert_user(&db, &id, &email, &contact, &shop_name, created).await?;
    store::append_audit(&db, "system", "signup", &id, &email, created).await?;
    Response::from_json(&SignupOut { status: "pending" })
}

#[derive(Deserialize)]
pub struct SignupIn {
    pub email: String,
    pub contact: String,
    #[serde(default)]
    pub shop_name: Option<String>,
}

#[derive(Serialize)]
pub struct SignupOut {
    pub status: &'static str,
}

/// `POST /api/v1/login {token}` — shows the token ONCE at approval; the
/// API answers a session id for Bearer use (never echoes the plat_ token).
pub async fn login(env: worker::Env, req: &mut worker::Request) -> Result<Response> {
    let Some(body) = http::json_body::<LoginIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {token}");
    };
    let token = body.token.trim();
    if token.is_empty() {
        return http::bad_request("BAD_TOKEN", "token required");
    }
    let db = store::db(&env)?;
    let Some(user) = user_by_token(&db, token).await? else {
        return http::unauthorized();
    };
    if user.status != "approved" {
        return http::json_error(403, "NOT_ACTIVE", "account is not approved");
    }
    let s = create_login_session(&db, &user.id).await?;
    Response::from_json(&LoginOut {
        session_id: s.id,
        user: store::UserView::from(&user),
    })
}

#[derive(Deserialize)]
pub struct LoginIn {
    pub token: String,
}

#[derive(Serialize)]
pub struct LoginOut {
    pub session_id: String,
    pub user: store::UserView,
}

/// `GET /api/v1/me` — Bearer session → user + allowance/usage snapshot.
pub async fn me(env: worker::Env, headers: &Headers) -> Result<Response> {
    let db = store::db(&env)?;
    let Some(s) = verify_session(&db, headers).await? else {
        return http::unauthorized();
    };
    let user = store::user_by_id(&db, &s.user_id)
        .await?
        .ok_or_else(|| Error::RustError(format!("session user {} missing", s.user_id)))?;
    match user.status.as_str() {
        "approved" => Response::from_json(&MeOut {
            user: store::UserView::from(&user),
            deploy_allowance: user.deploy_allowance,
            deploy_used: user.deploy_used,
        }),
        "suspended" => http::json_error(403, "SUSPENDED", "account suspended"),
        "rejected" => http::json_error(403, "REJECTED", "signup rejected"),
        _ => http::json_error(403, "NOT_ACTIVE", "account pending approval"),
    }
}

#[derive(Serialize)]
pub struct MeOut {
    pub user: store::UserView,
    pub deploy_allowance: i64,
    pub deploy_used: i64,
}

/// `POST /api/v1/revoke` — Bearer session logout: delete the session row.
pub async fn revoke(env: worker::Env, headers: &Headers) -> Result<Response> {
    let db = store::db(&env)?;
    if let Some(s) = verify_session(&db, headers).await? {
        store::delete_session(&db, &s.id).await?;
    }
    // Stays `ok` even for a stale/absent token: nothing left to revoke.
    Response::from_json(&RevokedOut { ok: true })
}

#[derive(Serialize)]
pub struct RevokedOut {
    pub ok: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_uniqueness_and_hash_stability() {
        let mut seen = std::collections::HashSet::new();
        for _ in 0..512 {
            let t = new_token();
            assert!(t.starts_with(TOKEN_PREFIX));
            assert_eq!(t.len(), TOKEN_PREFIX.len() + TOKEN_CHARS);
            seen.insert(t);
        }
        assert_eq!(seen.len(), 512, "every minted token must be unique");
    }

    #[test]
    fn hash_is_stable_and_does_not_leak_the_token() {
        let t = new_token();
        assert_eq!(hash_token(&t.clone()), hash_token(&t));
        assert_ne!(hash_token(&t), t);
        assert_eq!(hash_token(&t).len(), 64); // sha256 hex
        assert_ne!(hash_token(&t), hash_token("")); // non-trivial
    }

    #[test]
    fn hash_distinguishes_different_tokens() {
        let (a, b) = (new_token(), new_token());
        assert_ne!(a, b);
        assert_ne!(hash_token(&a), hash_token(&b));
    }

    #[test]
    fn session_expiration_boundary() {
        assert!(!session_expired(1_000, 999));
        assert!(session_expired(1_000, 1_000)); // now == expires: expired
        assert!(session_expired(1_000, 1_001));
    }
}

// ---------------------------------------------------- shop redemption (E)

#[derive(Deserialize)]
pub struct RedeemIn {
    pub code: String,
}

/// `POST /api/v1/shop/tokens/redeem {code}` — a shop turns a 4-digit
/// platform token into tryon_tokens credit. Auth: the shop's
/// PLATFORM_TOKEN as Bearer; the shop identity is looked up by the
/// cluster_id the deployer bound it with (shops table). Missing/cancelled/
/// used tokens are rejected; success flips the token to `used` and stamps
/// the shop.
pub async fn handle_redeem(env: Env, req: &mut Request) -> Result<Response> {
    let Some(token) = bearer(req.headers()) else {
        return crate::http::unauthorized();
    };
    let Some(body) = crate::http::json_body::<RedeemIn>(req).await else {
        return crate::http::bad_request("BAD_JSON", "expected {code}");
    };
    let db = store::db(&env)?;
    let now = now_ms();
    // Shops authenticate with the PLATFORM_TOKEN secret bound at deploy
    // time; the shops table row is found by matching that secret. Phase F
    // will pass shop_id explicitly once the shop runtime carries it.
    let Some(shop) = store::shop_by_token(&db, &token).await? else {
        return crate::http::unauthorized();
    };
    // A wrong/used/cancelled code is a client mistake, not a crash:
    // answer with the platform's error envelope.
    let redeemed = match store::redeem_shop_token(&db, &body.code, &shop.id, now).await {
        Ok(t) => t,
        Err(e) => {
            let msg = e.to_string();
            let code = if msg.contains("unknown token") {
                "UNKNOWN_TOKEN"
            } else {
                "TOKEN_USED"
            };
            return crate::http::json_error(400, code, "that code cannot be redeemed");
        }
    };
    // The code carries its face value: a code minted for 25 credits
    // gives the shop 25 credits (rev 0005).
    store::grant_credits(&db, &shop.id, redeemed.credits, now).await?;
    store::append_audit(&db, &shop.id, "tokens.redeem", &body.code, "", now).await?;
    Response::from_json(&serde_json::json!({
        "token": redeemed,
        "shop_id": shop.id,
        "credits": redeemed.credits,
        "balance": store::credits_left(&db, &shop.id).await.unwrap_or(0),
    }))
}
