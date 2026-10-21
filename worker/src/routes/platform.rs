/* routes/platform.rs - the only place that talks to the SaaSTryon
platform. Phase E: a shop redeems a 4-digit platform code in its
dashboard settings; the shop worker forwards it to the platform's
`/api/v1/shop/tokens/redeem` with the shop's PLATFORM_TOKEN secret and
passes the JSON verdict back. Not configured = clear 501, never a silent
call. The platform URL is `PLATFORM_URL` (unset in the plain shop, which
talks to Genlook directly). */
use serde::{Deserialize, Serialize};
use worker::{Env, Fetch, Headers, Method, Request, RequestInit, Response, Result};

pub fn base(env: &Env) -> String {
    env.var("PLATFORM_URL")
        .map(|v| v.to_string())
        .unwrap_or_default()
        .trim()
        .trim_end_matches('/')
        .to_string()
}

/// Configured = both a URL and the per-shop secret exist.
pub fn configured(env: &Env) -> bool {
    !base(env).is_empty()
        && !env
            .var("PLATFORM_TOKEN")
            .map(|v| v.to_string())
            .unwrap_or_default()
            .is_empty()
}

/// The Bearer the platform expects: the cluster secret bound at deploy
/// time (`shops.cluster_id` on the platform side).
pub fn secret(env: &Env) -> String {
    env.var("PLATFORM_TOKEN")
        .map(|v| v.to_string())
        .unwrap_or_default()
}

#[derive(Deserialize, Serialize)]
pub struct RedeemIn {
    pub code: String,
}

#[derive(Deserialize, Serialize)]
pub struct RedeemOut {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub balance: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Pure 4-digit code check (tested): exactly four ASCII digits.
pub fn valid_code(code: &str) -> bool {
    code.len() == 4 && code.chars().all(|c| c.is_ascii_digit())
}

/// `POST /api/studio/tokens/redeem {code}` — owner-gated. Forwards to the
/// platform and reports the verdict; the shop keeps no ledger of its own
/// (the platform's `credits` table is the one balance that matters).
pub async fn handle_redeem(mut req: Request, env: Env) -> Result<Response> {
    if !crate::routes::owner::authorized(&req, &env) {
        return crate::routes::errors::unauthorized();
    }
    let input: RedeemIn = req
        .json()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let code = input.code.trim().to_string();
    if !valid_code(&code) {
        return crate::routes::errors::json_error(400, "BAD_CODE", "enter the 4-digit code");
    }
    if !configured(&env) {
        return crate::routes::errors::json_error(
            501,
            "PLATFORM_NOT_CONFIGURED",
            "this shop does not run on the platform yet",
        );
    }
    let url = format!("{}/api/v1/shop/tokens/redeem", base(&env));
    let mut headers = Headers::new();
    headers.set("authorization", &format!("Bearer {}", secret(&env)))?;
    headers.set("content-type", "application/json")?;
    let mut init = RequestInit::new();
    init.with_method(Method::Post);
    init.with_headers(headers);
    init.with_body(Some(
        js_sys::Uint8Array::from(serde_json::to_vec(&RedeemIn { code })?.as_slice()).into(),
    ));
    let mut upstream = Fetch::Request(Request::new_with_init(&url, &init)?)
        .send()
        .await?;
    let status = upstream.status_code();
    let text = upstream.text().await?;
    if (200..300).contains(&status) {
        // The platform answers {token, shop_id, credits, balance}; the
        // shop only needs to know it worked and what it was worth.
        let credits = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v.get("credits").and_then(|c| c.as_i64()))
            .unwrap_or(1);
        return Response::from_json(&RedeemOut {
            ok: true,
            balance: None,
            message: Some(format!(
                "Code redeemed - {credits} try-on credit{} landed on this shop's balance.",
                if credits == 1 { "" } else { "s" }
            )),
        });
    }
    let msg = serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(String::from))
        .unwrap_or_else(|| "the platform rejected that code".into());
    crate::routes::errors::json_error(if status == 401 { 401 } else { 400 }, "REDEEM_FAILED", &msg)
}

#[derive(Deserialize, Serialize)]
pub struct RequestIn {
    pub requested: i64,
    #[serde(default)]
    pub reason: String,
}

/// What the platform knows about this shop's credits: the balance, how
/// much of it came from the codes the shop redeemed, and the codes
/// themselves.
#[derive(Deserialize, Serialize, Default)]
pub struct PlatformCredits {
    pub granted_total: i64,
    pub used_total: i64,
    pub left: i64,
    pub from_codes: i64,
    pub codes_redeemed: i64,
    #[serde(default)]
    pub codes: Vec<PlatformCode>,
}

#[derive(Deserialize, Serialize)]
pub struct PlatformCode {
    pub code: String,
    pub credits: i64,
    #[serde(default)]
    pub redeemed_ms: Option<i64>,
    #[serde(default)]
    pub note: Option<String>,
}

/// `GET /api/studio/credits/platform` - owner-gated. Asks the platform
/// (with the shop's cluster secret) what credits the shop has and where
/// they came from: the codes the shop redeemed carry a face value, so
/// the studio can show "40 of your 120 credits came from admin codes".
pub async fn handle_platform_credits(req: Request, env: Env) -> Result<Response> {
    if !crate::routes::owner::authorized(&req, &env) {
        return crate::routes::errors::unauthorized();
    }
    if !configured(&env) {
        return crate::routes::errors::json_error(
            501,
            "PLATFORM_NOT_CONFIGURED",
            "this shop does not run on the platform yet",
        );
    }
    let url = format!("{}/api/v1/shop/credits", base(&env));
    let mut headers = Headers::new();
    headers.set("authorization", &format!("Bearer {}", secret(&env)))?;
    let mut init = RequestInit::new();
    init.with_method(Method::Get);
    init.with_headers(headers);
    let mut upstream = Fetch::Request(Request::new_with_init(&url, &init)?)
        .send()
        .await?;
    let status = upstream.status_code();
    let text = upstream.text().await?;
    if !(200..300).contains(&status) {
        return crate::routes::errors::json_error(
            502,
            "PLATFORM_ERROR",
            "the platform did not answer",
        );
    }
    let out: PlatformCredits =
        serde_json::from_str(&text).map_err(|e| worker::Error::RustError(e.to_string()))?;
    Response::from_json(&out)
}

#[derive(Deserialize, Serialize)]
pub struct RequestOut {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Pure: request window (tested) — mirrors the platform's 1..=10_000.
pub fn valid_amount(n: i64) -> bool {
    (1..=10_000).contains(&n)
}

/// `POST /api/studio/tokens/request {requested, reason?}` — owner-gated.
/// The platform puts the request in front of its admin (manual billing
/// gate); credits land only after an approval.
pub async fn handle_request(mut req: Request, env: Env) -> Result<Response> {
    if !crate::routes::owner::authorized(&req, &env) {
        return crate::routes::errors::unauthorized();
    }
    let input: RequestIn = req
        .json()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    if !valid_amount(input.requested) {
        return crate::routes::errors::json_error(
            400,
            "BAD_AMOUNT",
            "request between 1 and 10000 credits",
        );
    }
    if !configured(&env) {
        return crate::routes::errors::json_error(
            501,
            "PLATFORM_NOT_CONFIGURED",
            "this shop does not run on the platform yet",
        );
    }
    let url = format!("{}/api/v1/shop/credits/request", base(&env));
    let mut headers = Headers::new();
    headers.set("authorization", &format!("Bearer {}", secret(&env)))?;
    headers.set("content-type", "application/json")?;
    let body = serde_json::to_vec(&RequestIn {
        requested: input.requested,
        reason: input.reason.trim().to_string(),
    })?;
    let mut init = RequestInit::new();
    init.with_method(Method::Post);
    init.with_headers(headers);
    init.with_body(Some(js_sys::Uint8Array::from(body.as_slice()).into()));
    let mut upstream = Fetch::Request(Request::new_with_init(&url, &init)?)
        .send()
        .await?;
    let status = upstream.status_code();
    let text = upstream.text().await?;
    if (200..300).contains(&status) {
        return Response::from_json(&RequestOut {
            ok: true,
            message: Some(
                "Request sent - the platform admin will review it and top up your balance.".into(),
            ),
        });
    }
    let msg = serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(String::from))
        .unwrap_or_else(|| "the platform rejected that request".into());
    crate::routes::errors::json_error(
        if status == 401 { 401 } else { 400 },
        "REQUEST_FAILED",
        &msg,
    )
}

/// Pure: the platform proxy URL for a Genlook relative path (tested).
pub fn genlook_proxy_url(platform_base: &str, path: &str) -> String {
    format!(
        "{}/api/v1/shop/genlook/{}",
        platform_base.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

/// Forwards one Genlook call through the platform proxy, where the call
/// is metered against the shop's `tryon_tokens` credits. `path` is
/// relative to the Genlook base (`images/upload`, `try-on/sync`,
/// `generations/<id>`). Only used when `configured()` — a plain shop
/// keeps talking to Genlook directly with its own key.
pub async fn genlook_forward(
    env: &Env,
    method: Method,
    path: &str,
    content_type: Option<&str>,
    body: Option<Vec<u8>>,
) -> Result<Response> {
    let mut headers = Headers::new();
    headers.set("authorization", &format!("Bearer {}", secret(env)))?;
    if let Some(ct) = content_type {
        headers.set("content-type", ct)?;
    }
    let mut init = RequestInit::new();
    init.with_method(method);
    init.with_headers(headers);
    init.with_body(body.map(|b| js_sys::Uint8Array::from(b.as_slice()).into()));
    let url = genlook_proxy_url(&base(env), path);
    Fetch::Request(Request::new_with_init(&url, &init)?)
        .send()
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_amounts_are_bounded() {
        assert!(valid_amount(1));
        assert!(valid_amount(10_000));
        assert!(!valid_amount(0));
        assert!(!valid_amount(-3));
        assert!(!valid_amount(10_001));
    }

    #[test]
    fn proxy_url_joins_without_double_slashes() {
        assert_eq!(
            genlook_proxy_url("https://platform.example", "images/upload"),
            "https://platform.example/api/v1/shop/genlook/images/upload"
        );
        assert_eq!(
            genlook_proxy_url("https://platform.example/", "/try-on/sync"),
            "https://platform.example/api/v1/shop/genlook/try-on/sync"
        );
    }

    #[test]
    fn codes_are_exactly_four_digits() {
        assert!(valid_code("0421"));
        assert!(!valid_code("421"));
        assert!(!valid_code("04215"));
        assert!(!valid_code("04a1"));
        assert!(!valid_code(""));
    }
}
