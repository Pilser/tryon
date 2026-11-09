/* oauth.rs - Google + TikTok Login Kit OAuth for unified login (Phase A).
Both flows redirect to the provider, then the callback exchanges the
code for an access token, fetches the user profile, finds or creates a
platform user (auto-approved, 5 free try-ons), issues a session, sets
the shared .latiforge.com cookie, and redirects to home.html. */
use serde::Deserialize;
use worker::{Env, Headers, Request, Response, Result};

use crate::{auth, http, store};

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v3/userinfo";

const TIKTOK_AUTH_URL: &str = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL: &str = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_USERINFO_URL: &str = "https://open.tiktokapis.com/v2/user/info/";

/// Setting names in platform_settings.
pub const GOOGLE_CLIENT_ID: &str = "google_client_id";
pub const GOOGLE_CLIENT_SECRET: &str = "google_client_secret";
pub const TIKTOK_CLIENT_KEY: &str = "tiktok_client_key";
pub const TIKTOK_CLIENT_SECRET: &str = "tiktok_client_secret";
pub const TOS_URL: &str = "tos_url";
pub const PRIVACY_URL: &str = "privacy_url";

/// Read a setting, falling back to an env var of the same name (uppercased).
async fn setting(env: &Env, name: &str) -> String {
    if let Ok(db) = store::db(env) {
        if let Ok(v) = store::setting(&db, name).await {
            if !v.trim().is_empty() {
                return v;
            }
        }
    }
    env.var(&name.to_uppercase())
        .map(|v| v.to_string())
        .unwrap_or_default()
}

fn redirect(location: &str) -> Result<Response> {
    Response::empty().map(|r| {
        r.with_status(302).with_headers({
            let mut h = Headers::new();
            let _ = h.set("Location", location);
            h
        })
    })
}

// ---------------- Google ----------------

#[derive(Deserialize)]
struct GoogleTokenResp {
    access_token: String,
}

#[derive(Deserialize)]
struct GoogleUser {
    email: String,
    name: Option<String>,
}

pub async fn google_redirect(env: Env, req: &Request) -> Result<Response> {
    let client_id = setting(&env, GOOGLE_CLIENT_ID).await;
    if client_id.is_empty() {
        return http::bad_request("NO_GOOGLE", "Google client id not configured");
    }
    let redirect_uri = "https://latiforge.com/api/v1/auth/google/callback";
    let url = format!(
        "{GOOGLE_AUTH_URL}?client_id={}&redirect_uri={}&response_type=code&scope=openid%20email%20profile&access_type=offline",
        urlencoding(&client_id),
        urlencoding(redirect_uri)
    );
    let _ = req;
    redirect(&url)
}

pub async fn google_callback(env: Env, req: &Request) -> Result<Response> {
    let url = req
        .url()
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let code = url
        .query_pairs()
        .find(|(k, _)| k == "code")
        .map(|(_, v)| v.to_string())
        .unwrap_or_default();
    if code.is_empty() {
        return http::bad_request("NO_CODE", "missing code");
    }
    let client_id = setting(&env, GOOGLE_CLIENT_ID).await;
    let client_secret = setting(&env, GOOGLE_CLIENT_SECRET).await;
    // Exchange code for token
    let body = format!(
        "code={}&client_id={}&client_secret={}&redirect_uri={}&grant_type=authorization_code",
        urlencoding(&code),
        urlencoding(&client_id),
        urlencoding(&client_secret),
        urlencoding("https://latiforge.com/api/v1/auth/google/callback")
    );
    let mut headers = Headers::new();
    headers.set("content-type", "application/x-www-form-urlencoded")?;
    let mut init = worker::RequestInit::new();
    init.with_method(worker::Method::Post);
    init.with_headers(headers);
    init.with_body(Some(js_sys::Uint8Array::from(body.as_bytes()).into()));
    let upstream = worker::Request::new_with_init(GOOGLE_TOKEN_URL, &init)?;
    let mut resp = worker::Fetch::Request(upstream)
        .send()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let text = resp
        .text()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let tok: GoogleTokenResp = serde_json::from_str(&text)
        .map_err(|e| worker::Error::RustError(format!("token parse: {e}")))?;
    // Get user info
    let mut h2 = Headers::new();
    h2.set("Authorization", &format!("Bearer {}", tok.access_token))?;
    let mut init2 = worker::RequestInit::new();
    init2.with_method(worker::Method::Get);
    init2.with_headers(h2);
    let req2 = worker::Request::new_with_init(GOOGLE_USERINFO_URL, &init2)?;
    let mut resp2 = worker::Fetch::Request(req2)
        .send()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let text2 = resp2
        .text()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let user: GoogleUser = serde_json::from_str(&text2)
        .map_err(|e| worker::Error::RustError(format!("userinfo parse: {e}")))?;
    finish_oauth(&env, &user.email, user.name.as_deref().unwrap_or("")).await
}

// ---------------- TikTok ----------------

#[derive(Deserialize)]
struct TikTokTokenResp {
    access_token: String,
}

#[derive(Deserialize)]
struct TikTokUserResp {
    data: TikTokUserData,
}

#[derive(Deserialize)]
struct TikTokUserData {
    user: TikTokUser,
}

#[derive(Deserialize)]
struct TikTokUser {
    open_id: String,
    display_name: Option<String>,
    avatar_url: Option<String>,
}

pub async fn tiktok_redirect(env: Env, req: &Request) -> Result<Response> {
    let client_key = setting(&env, TIKTOK_CLIENT_KEY).await;
    if client_key.is_empty() {
        return http::bad_request("NO_TIKTOK", "TikTok client key not configured");
    }
    let redirect_uri = "https://latiforge.com/api/v1/auth/tiktok/callback";
    // PKCE
    use base64::Engine as _;

    // In tiktok_redirect:
    let verifier = auth::random_hex(32);
    // SHA-256 of verifier, base64url-encoded (no padding) = code_challenge
    use sha2::{Digest, Sha256};
    let hash = Sha256::digest(verifier.as_bytes());
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hash);
    let state = auth::random_hex(16);
    let url = format!(
        "{TIKTOK_AUTH_URL}?client_key={}&scope=user.info.basic&response_type=code&redirect_uri={}&state={}&code_challenge={}&code_challenge_method=S256",
        urlencoding(&client_key),
        urlencoding(redirect_uri),
        urlencoding(&state),
        urlencoding(&challenge)
    );
    // Store verifier in a cookie for the callback
    let mut resp = redirect(&url)?;
    resp.headers_mut().set(
        "Set-Cookie",
        &format!(
            "tiktok_pkce={}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600",
            verifier
        ),
    )?;
    let _ = state;
    Ok(resp)
}

pub async fn tiktok_callback(env: Env, req: &Request) -> Result<Response> {
    let url = req
        .url()
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let code = url
        .query_pairs()
        .find(|(k, _)| k == "code")
        .map(|(_, v)| v.to_string())
        .unwrap_or_default();
    if code.is_empty() {
        return http::bad_request("NO_CODE", "missing code");
    }
    let client_key = setting(&env, TIKTOK_CLIENT_KEY).await;
    let client_secret = setting(&env, TIKTOK_CLIENT_SECRET).await;
    // Read PKCE verifier from cookie
    let verifier = auth::cookie(req.headers(), "tiktok_pkce").unwrap_or_default();
    let body = format!(
        "client_key={}&client_secret={}&code={}&grant_type=authorization_code&redirect_uri={}&code_verifier={}",
        urlencoding(&client_key),
        urlencoding(&client_secret),
        urlencoding(&code),
        urlencoding("https://latiforge.com/api/v1/auth/tiktok/callback"),
        urlencoding(&verifier)
    );
    let mut headers = Headers::new();
    headers.set("content-type", "application/x-www-form-urlencoded")?;
    let mut init = worker::RequestInit::new();
    init.with_method(worker::Method::Post);
    init.with_headers(headers);
    init.with_body(Some(js_sys::Uint8Array::from(body.as_bytes()).into()));
    let upstream = worker::Request::new_with_init(TIKTOK_TOKEN_URL, &init)?;
    let mut resp = worker::Fetch::Request(upstream)
        .send()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let text = resp
        .text()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let tok: TikTokTokenResp = serde_json::from_str(&text)
        .map_err(|e| worker::Error::RustError(format!("token parse: {e}")))?;
    // Get user info
    let mut h2 = Headers::new();
    h2.set("Authorization", &format!("Bearer {}", tok.access_token))?;
    let mut init2 = worker::RequestInit::new();
    init2.with_method(worker::Method::Get);
    init2.with_headers(h2);
    let req2 = worker::Request::new_with_init(
        &format!("{TIKTOK_USERINFO_URL}?fields=open_id,display_name,avatar_url"),
        &init2,
    )?;
    let mut resp2 = worker::Fetch::Request(req2)
        .send()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let text2 = resp2
        .text()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let user: TikTokUserResp = serde_json::from_str(&text2)
        .map_err(|e| worker::Error::RustError(format!("userinfo parse: {e}")))?;
    let email = format!("{}@tiktok.latiforge", user.data.user.open_id);
    let name = user.data.user.display_name.unwrap_or_default();
    finish_oauth(&env, &email, &name).await
}

// ---------------- shared ----------------

async fn finish_oauth(env: &Env, email: &str, name: &str) -> Result<Response> {
    let db = store::db(env)?;
    let user = match store::user_by_email(&db, email).await? {
        Some(u) => u,
        None => {
            let id = store::new_id("usr");
            let reg_no = store::next_reg_no(&db).await?;
            let created = auth::now_ms();
            store::insert_user_auto(&db, &id, email, name, &reg_no, "", "", 5, created).await?;
            let token = auth::new_token();
            store::set_auth(&db, &id, &auth::hash_token(&token), created).await?;
            store::user_by_id(&db, &id).await?.unwrap()
        }
    };
    if user.status != "approved" {
        store::set_status(&db, &user.id, "approved", Some("auto")).await?;
        store::set_allowance(&db, &user.id, 5).await?;
    }
    let s = auth::create_login_session(&db, &user.id).await?;
    let mut resp = Response::empty().map(|r| {
        r.with_status(302).with_headers({
            let mut h = Headers::new();
            let _ = h.set("Location", "home.html");
            h
        })
    })?;
    resp.headers_mut().set(
        "Set-Cookie",
        &format!(
            "tryon_session={}; Domain=.latiforge.com; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000",
            s.id
        ),
    )?;
    Ok(resp)
}

fn urlencoding(s: &str) -> String {
    // Minimal percent-encoding for query params.
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}
