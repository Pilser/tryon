/* outbound.rs - the Genlook proxy for tenant shops (Phase E). A tenant
shop calls `/api/v1/shop/genlook/<path>` with Bearer = its cluster
secret; ONLY try-on-creating paths (`try-on`, `try-on/sync`) meter one
`tryon_tokens` credit (atomic check-and-decrement that fails closed when
the D1 meta counter is unknown). Uploads (`images/upload`) and polls
(`generations/:id`) are free — Genlook charges only for generation, so
we must not charge for anything else. Forward with the platform's key;
the shop never sees it. A Genlook 5xx (or a transport error) refunds the
credit when one was metered; a 4xx consumes it — the attempt was metered
capacity, the payload was the shop's fault. Transport errors always come
back as JSON `{code,message,status}` so the shop surfaces a real message. */
use worker::{Env, Error, Fetch, Headers, Method, Request, RequestInit, Response, Result};

use crate::{auth, http, shops, store};

/// Production base. `GENLOOK_BASE` overrides it for local dev — same
/// contract as the shop's `genlook_api.rs`.
pub const BASE: &str = "https://api.genlook.app/tryon/v1";

/// Pure resolution of the base URL so the override is testable.
pub fn resolve_base(override_url: Option<String>) -> String {
    match override_url {
        Some(v) if !v.trim().is_empty() => v.trim().trim_end_matches('/').to_string(),
        _ => BASE.to_string(),
    }
}

pub fn base(env: &Env) -> String {
    resolve_base(env.var("GENLOOK_BASE").ok().map(|v| v.to_string()))
}

/// The platform's own Genlook key. Missing secret = hard error, never a
/// silent unauthenticated call.
///
/// The key may live in two places: the `GENLOOK_API_KEY` secret (set
/// at deploy time) or the `platform_settings` row the admin console
/// writes (rev 0006). The row wins: it is what the operator can change
/// from the UI without a redeploy - and a redeploy is exactly what a
/// poisoned isolate needs, so the setting must not depend on one.
pub async fn api_key(env: &Env) -> Result<String> {
    if let Ok(db) = store::db(env) {
        if let Ok(k) = store::setting(&db, GENLOOK_KEY_SETTING).await {
            if !k.trim().is_empty() {
                return Ok(k);
            }
        }
    }
    let k = env
        .var("GENLOOK_API_KEY")
        .map(|v| v.to_string())
        .unwrap_or_default();
    if k.is_empty() {
        return Err(Error::RustError("missing GENLOOK_API_KEY secret".into()));
    }
    Ok(k)
}

/// The setting name the admin console writes the try-on API key into.
pub const GENLOOK_KEY_SETTING: &str = "genlook_api_key";

/// Pure: the Genlook URL a proxied shop call maps to (tested).
pub fn genlook_target(base: &str, path: &str) -> String {
    format!(
        "{}/{}",
        base.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

/// The Genlook paths that start a generation and therefore cost a credit.
/// Uploads (`images/upload`) and polls (`generations/:id`) are free —
/// Genlook bills only for generation, so the meter must match that.
pub fn is_metered_path(path: &str) -> bool {
    path == "try-on" || path.starts_with("try-on/")
}

/// `GET|POST /api/v1/shop/genlook/<path>` — shop-authenticated Genlook
/// proxy with per-shop credit metering. `path` is the remainder of the
/// Genlook API path (e.g. `images/upload`, `try-on/sync`,
/// `generations/<id>`), passed through verbatim.
///
/// Only try-on-creating paths cost a credit; uploads and polls are free
/// (Genlook bills for generation only). Transport errors / upstream 5xx
/// refund the metered credit and answer a JSON error body so the shop's
/// frontend can show the real problem instead of a bare 500.
pub async fn handle_genlook(env: Env, req: &mut Request, path: String) -> Result<Response> {
    let Some(token) = auth::bearer(req.headers()) else {
        return http::unauthorized();
    };
    let db = store::db(&env)?;
    let Some(shop) = shops::shop_by_token(&db, &token).await? else {
        return http::unauthorized();
    };
    let now = auth::now_ms();

    // Meter only generation-creating calls. `try-on` and `try-on/sync`
    // are the only paths that start a generation (and therefore cost a
    // credit). Everything else — `images/upload`, `generations/:id`,
    // `products`, `check-credits` — is free.
    let metered = is_metered_path(&path);
    let paid = if metered {
        shops::consume_credit(&db, &shop.id, now).await?
    } else {
        true
    };
    if !paid {
        return http::json_error(
            402,
            "NO_CREDITS",
            "try-on balance empty — redeem a platform code in settings",
        );
    }

    let method = req.method();
    let ct = req
        .headers()
        .get("content-type")
        .unwrap_or_default()
        .unwrap_or_default();
    let bytes = req
        .bytes()
        .await
        .map_err(|e| Error::RustError(e.to_string()))?;
    let body = match method {
        Method::Post => Some(bytes),
        _ => None,
    };

    let mut headers = Headers::new();
    headers.set("x-api-key", &api_key(&env).await?)?;
    if !ct.is_empty() {
        headers.set("content-type", &ct)?;
    }
    let mut init = RequestInit::new();
    init.with_method(method);
    init.with_headers(headers);
    init.with_body(body.map(|b| js_sys::Uint8Array::from(b.as_slice()).into()));

    let upstream = Request::new_with_init(&genlook_target(&base(&env), &path), &init)?;
    let resp = match Fetch::Request(upstream).send().await {
        Ok(r) => r,
        // Transport failure: refund if a credit was metered (the call
        // never reached Genlook) and answer a JSON error so the shop can
        // show a real message instead of an opaque 500.
        Err(e) => {
            let _ = e;
            if metered {
                let _ = shops::grant_credits(&db, &shop.id, 1, now).await;
            }
            return http::json_error(
                502,
                "GENLOOK_UNREACHABLE",
                "try-on service unreachable — please retry",
            );
        }
    };
    if resp.status_code() >= 500 {
        // Genlook-side outage: refund a metered credit. A 4xx keeps the
        // charge — metered capacity was used, the payload was the caller's
        // fault.
        if metered {
            shops::grant_credits(&db, &shop.id, 1, now).await?;
        }
    }
    Ok(resp)
}

// --------------------------------------------------------------- tests

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_override_wins_only_when_non_empty() {
        assert_eq!(resolve_base(None), BASE);
        assert_eq!(resolve_base(Some(String::new())), BASE);
        assert_eq!(resolve_base(Some("   ".into())), BASE);
        assert_eq!(
            resolve_base(Some("http://127.0.0.1:8899/tryon/v1".into())),
            "http://127.0.0.1:8899/tryon/v1"
        );
        // A trailing slash on the override must not double up.
        assert_eq!(
            genlook_target(&resolve_base(Some("http://x/y/".into())), "z"),
            "http://x/y/z"
        );
    }

    #[test]
    fn target_joins_without_double_slashes() {
        assert_eq!(
            genlook_target("https://api.genlook.app/tryon/v1", "images/upload"),
            "https://api.genlook.app/tryon/v1/images/upload"
        );
        assert_eq!(
            genlook_target("https://api.genlook.app/tryon/v1/", "/try-on/sync"),
            "https://api.genlook.app/tryon/v1/try-on/sync"
        );
    }

    #[test]
    fn only_try_on_paths_meter_a_credit() {
        // Generation-creating paths are charged.
        assert!(is_metered_path("try-on"));
        assert!(is_metered_path("try-on/sync"));
        // Free paths must NOT be charged (uploads, polls, products…).
        assert!(!is_metered_path("images/upload"));
        assert!(!is_metered_path("generations/cm8gen456xyz"));
        assert!(!is_metered_path("products"));
        assert!(!is_metered_path("check-credits"));
    }
}
