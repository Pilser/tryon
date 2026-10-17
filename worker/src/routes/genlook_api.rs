/* routes/genlook_api.rs - the only place that talks to the Genlook API.
One base URL, one key, one forwarding helper; handlers stay thin. */
use worker::{Env, Fetch, Headers, Method, Request, RequestInit, Response, Result};

/// Production base. `GENLOOK_BASE` overrides it for local dev, where
/// `mock-genlook/` stands in for the real service and returns the person
/// photo unchanged after a configurable delay.
pub const BASE: &str = "https://api.genlook.app/tryon/v1";

/// Pure resolution of the base URL so the override is testable without a
/// live Worker `Env`.
pub fn resolve_base(override_url: Option<String>) -> String {
    match override_url {
        Some(v) if !v.trim().is_empty() => v.trim().to_string(),
        _ => BASE.to_string(),
    }
}

pub fn base(env: &Env) -> String {
    resolve_base(env.var("GENLOOK_BASE").ok().map(|v| v.to_string()))
}

/// The `x-api-key` every call carries. Missing secret = hard error, never a
/// silent unauthenticated call.
pub fn api_key(env: &Env) -> Result<String> {
    let k = env
        .var("GENLOOK_API_KEY")
        .map(|v| v.to_string())
        .unwrap_or_default();
    if k.is_empty() {
        return Err(worker::Error::RustError(
            "missing GENLOOK_API_KEY secret".into(),
        ));
    }
    Ok(k)
}

/// Keep Genlook's JSON error body (`{code,message,status}`) when there is
/// one: the shop reads `message` (and can act on `code`), so a refund or a
/// top-up prompt survives instead of collapsing into plain text. Anything
/// that is not a JSON object is trimmed to 300 chars, as before.
pub fn error_response(status: u16, body: &str) -> Result<Response> {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
        if v.is_object() {
            return Response::from_json(&v).map(|r| r.with_status(status));
        }
    }
    let short: String = body.chars().take(300).collect();
    Response::error(short, status)
}

/// Forward a call to Genlook, passing the JSON body through so the client
/// sees the real `generationId` / `resultImageUrl` / error `code`.
pub async fn forward(
    key: &str,
    method: Method,
    url: &str,
    content_type: Option<&str>,
    body: Option<Vec<u8>>,
) -> Result<Response> {
    let mut headers = Headers::new();
    headers.set("x-api-key", key)?;
    if let Some(ct) = content_type {
        headers.set("content-type", ct)?;
    }
    let mut init = RequestInit::new();
    init.with_method(method);
    init.with_headers(headers);
    if let Some(b) = body {
        init.with_body(Some(js_sys::Uint8Array::from(b.as_slice()).into()));
    }
    let out = Request::new_with_init(url, &init)?;
    let mut upstream = Fetch::Request(out).send().await?;
    let status = upstream.status_code();
    let text = upstream.text().await?;
    if (200..300).contains(&status) {
        let v: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| worker::Error::RustError(e.to_string()))?;
        Response::from_json(&v)
    } else {
        error_response(status, &text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_defaults_to_production() {
        assert_eq!(resolve_base(None), BASE);
        assert_eq!(resolve_base(Some(String::new())), BASE);
        assert_eq!(resolve_base(Some("   ".into())), BASE);
    }

    #[test]
    fn base_honours_override_and_trims() {
        assert_eq!(
            resolve_base(Some(" http://127.0.0.1:8899/tryon/v1 ".into())),
            "http://127.0.0.1:8899/tryon/v1"
        );
    }

    #[test]
    fn error_json_is_recognised() {
        // The mock (and production) answer errors as {code,message,status};
        // those must survive as JSON, not collapse to text.
        let v: serde_json::Value = serde_json::from_str(
            r#"{"code":"INSUFFICIENT_CREDITS","message":"Top up","status":402}"#,
        )
        .unwrap();
        assert!(v.is_object());
        assert_eq!(v["code"], "INSUFFICIENT_CREDITS");
        // Anything else falls back to trimmed text.
        assert!(
            !serde_json::from_str::<serde_json::Value>("Internal Server Error")
                .map(|x| x.is_object())
                .unwrap_or(false)
        );
    }
}
