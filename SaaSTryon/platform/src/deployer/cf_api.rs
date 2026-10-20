/* cf_api.rs - the minimal Cloudflare REST client the deployer uses
(D-P1/B2 script mode: plain `PUT /accounts/{id}/workers/scripts/{name}`,
no dispatch namespace — PLATFORM.md §3.2/§4.1).

API facts used (re-verified live 2026-10-19):
- Bearer auth: `Authorization: Bearer CLOUDFLARE_API_TOKEN`; account id
  from the `CF_ACCOUNT_ID` var.
- Errors: CF answers `{success:false, errors:[{code,message}]}`; the
  client maps that into `CfError`.
- Rate limits (B7): 1,200 req / 5 min per token + `retry-after` and a
  `Ratelimit: reset=..;remaining=..` response header; retries happen ONLY
  inside one deploy invocation (serial per deployment; Workers are
  stateless). Backoff honours `retry-after`, clamped 2-30 s, else x2.
- Assets upload is the one call NOT authenticated by the platform token:
  it carries the session JWT instead (`CfRequest.jwt`). */
use serde_json::Value;
use worker::{Fetch, Headers, Method, Request, RequestInit};

pub const BASE: &str = "https://api.cloudflare.com/client/v4";

/// How many retries one deploy invocation is allowed (max 3, B7 note).
pub const MAX_RETRIES: u32 = 3;

// ------------------------------------------------------------ requests

pub use super::cf_config::CfConfig;

#[derive(Debug, Clone)]
pub struct CfRequest {
    pub method: Method,
    /// Path AFTER `/client/v4`, account id already substituted.
    pub path: String,
    pub body: CfBody,
    /// Session JWT override for calls that are not platform-token
    /// authenticated (assets upload). `None` = platform Bearer.
    pub jwt: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CfBody {
    Empty,
    Json(Value),
    /// Manually built multipart/form-data bytes (script-PUT + assets
    /// upload). `content_type` carries the boundary.
    Raw(RawBody),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawBody {
    pub content_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct CfResponse {
    pub status: u16,
    pub body: String,
    /// `retry-after` seconds, when the answer carries one.
    pub retry_after: Option<u64>,
    /// `Ratelimit` header `remaining=` value, when present.
    pub ratelimit_remaining: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CfError {
    pub code: i64,
    pub message: String,
    pub status: u16,
}

impl std::fmt::Display for CfError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "cf api error {}: {} ({})",
            self.code, self.message, self.status
        )
    }
}

impl CfError {
    /// B7: rate limiting shows up as HTTP 429 (or a body explaining it).
    pub fn is_rate_limited(&self) -> bool {
        self.status == 429 || self.code == 429
    }

    pub fn transport(status: u16, message: impl Into<String>) -> Self {
        CfError {
            code: -1,
            message: message.into(),
            status,
        }
    }
}

impl From<CfError> for worker::Error {
    fn from(e: CfError) -> Self {
        worker::Error::RustError(e.to_string())
    }
}

impl CfResponse {
    pub fn ok(&self) -> bool {
        (200..300).contains(&self.status)
    }
}

// ------------------------------------------------------------- parsing

/// The `result` payload of a Cloudflare answer (the envelope is
/// `{success, result, errors}`; some calls answer with the payload at
/// the top level).
pub fn result_of(value: &Value) -> &Value {
    value.get("result").unwrap_or(value)
}

#[derive(Debug, Clone, Default)]
pub struct Parsed {
    pub value: Value,
    pub retry_after: Option<u64>,
    pub ratelimit_remaining: Option<u64>,
}

/// `String -> Parsed` for tests + the transport.
pub fn parse_response(status: u16, body: &str, headers: &RateHeaders) -> Result<Parsed, CfError> {
    let value: Value = if body.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str(body).map_err(|_| {
            // Non-JSON answer (proxy error page etc.) - keep a snippet.
            CfError::transport(status, format!("non-json cf response: {}", snippet(body)))
        })?
    };
    if !value_is_success(status, &value) {
        return Err(parse_cf_errors_value(&value, status).unwrap_or_else(|| {
            CfError::transport(status, format!("cf api failure: {}", snippet(body)))
        }));
    }
    Ok(Parsed {
        value,
        retry_after: headers.retry_after,
        ratelimit_remaining: headers.ratelimit_remaining,
    })
}

fn value_is_success(status: u16, value: &Value) -> bool {
    if !(200..300).contains(&status) {
        return false;
    }
    // CF sometimes answers 200 with success:false (D1 query errors).
    value
        .get("success")
        .and_then(|s| s.as_bool())
        .unwrap_or(true)
}

/// `{success:false, errors:[{code,message}]}` -> Some (only when the body
/// really reports a failure; `success:true` bodies yield None).
pub fn parse_cf_errors(body: &str) -> Option<CfError> {
    let v: Value = serde_json::from_str(body).ok()?;
    extract_cf_error(&v, 200)
}

fn extract_cf_error(v: &Value, status: u16) -> Option<CfError> {
    if v.get("success").and_then(|s| s.as_bool()) == Some(true) {
        return None;
    }
    let first = v.get("errors")?.as_array()?.first()?;
    Some(CfError {
        code: first.get("code").and_then(|c| c.as_i64()).unwrap_or(-1),
        message: first
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("no message")
            .to_string(),
        status,
    })
}

pub fn parse_cf_errors_value(v: &Value, status: u16) -> Option<CfError> {
    extract_cf_error(v, status)
}

fn snippet(s: &str) -> String {
    let snip: String = s.chars().take(200).collect();
    snip
}

/// The rate-limit related response headers we care about (B7).
#[derive(Debug, Clone, Copy, Default)]
pub struct RateHeaders {
    pub retry_after: Option<u64>,
    pub ratelimit_remaining: Option<u64>,
}

/// `Ratelimit: reset=120;remaining=1198;policy=1200;per=300` -> Some(1198)
pub fn parse_ratelimit_remaining(raw: Option<&str>) -> Option<u64> {
    let raw = raw?;
    for part in raw.split(';') {
        let Some((k, v)) = part.split_once('=') else {
            continue;
        };
        if k.trim().eq_ignore_ascii_case("remaining") {
            return v.trim().parse().ok();
        }
    }
    None
}

pub fn retry_after_seconds(raw: Option<&str>) -> Option<u64> {
    raw.and_then(|v| v.trim().parse().ok())
}

// ------------------------------------------------------------- retries

/// Retryable: 429 (token rate limit) and any 5xx transient.
/// 4xx answers are deterministic - fail fast, do not hammer the API.
pub fn should_retry(status: u16) -> bool {
    status == 429 || status >= 500
}

/// Backoff math (B7): honour the server's `retry-after` seconds when
/// present, clamped to 2..=30 s; otherwise a linear x2 schedule starting
/// at 2 s for the attempt that just failed.
pub fn next_backoff_ms(retry_after: Option<u64>, attempt: u32) -> u64 {
    const MIN_MS: u64 = 2_000;
    const MAX_MS: u64 = 30_000;
    let base = match retry_after {
        Some(s) => s.saturating_mul(1_000),
        None => 2_000u64.saturating_mul(1 << attempt),
    };
    base.clamp(MIN_MS, MAX_MS)
}

/// setTimeout interop. Never called on the native test host (mock flows
/// inject a no-op sleeper), so no JS runtime is needed there.
pub async fn delay_ms(ms: u64) {
    #[wasm_bindgen::prelude::wasm_bindgen]
    extern "C" {
        #[wasm_bindgen::prelude::wasm_bindgen(js_name = "setTimeout")]
        fn set_timeout(handler: &js_sys::Function, ms: f64);
    }
    let promise = js_sys::Promise::new(&mut |resolve, _reject| {
        set_timeout(&resolve.into(), ms as f64);
    });
    let _ = wasm_bindgen_futures::JsFuture::from(promise).await;
}

// ----------------------------------------------------------- transport

/// Async-fn-in-trait is intentional here (rustc 1.97 target): all
/// implementations are local fakes or the JS fetch transport - the
/// auto-trait-bound caveat does not apply to this closed set.
#[allow(async_fn_in_trait)]
pub trait Transport {
    async fn call(&self, req: CfRequest) -> Result<CfResponse, CfError>;
}

pub struct FetchTransport {
    token: String,
}

impl FetchTransport {
    pub fn new(cfg: CfConfig) -> Self {
        FetchTransport { token: cfg.token }
    }
}

impl Transport for FetchTransport {
    async fn call(&self, req: CfRequest) -> Result<CfResponse, CfError> {
        let url = format!("{}{}", BASE, req.path);
        let mut headers = Headers::new();
        let bearer = format!("Bearer {}", req.jwt.as_deref().unwrap_or(&self.token));
        headers
            .set("authorization", &bearer)
            .map_err(|e| CfError::transport(0, format!("header: {e}")))?;
        let init_body = match &req.body {
            CfBody::Empty => None,
            CfBody::Json(v) => {
                headers
                    .set("content-type", "application/json")
                    .map_err(|e| CfError::transport(0, format!("header: {e}")))?;
                Some(js_sys::Uint8Array::from(v.to_string().as_bytes()).into())
            }
            CfBody::Raw(raw) => {
                headers
                    .set("content-type", &raw.content_type)
                    .map_err(|e| CfError::transport(0, format!("header: {e}")))?;
                Some(js_sys::Uint8Array::from(raw.bytes.as_slice()).into())
            }
        };
        let mut init = RequestInit::new();
        init.with_method(req.method);
        init.with_headers(headers);
        if let Some(b) = init_body {
            init.with_body(Some(b));
        }
        let out = Request::new_with_init(&url, &init)
            .map_err(|e| CfError::transport(0, format!("request init: {e}")))?;
        let mut resp = Fetch::Request(out)
            .send()
            .await
            .map_err(|e| CfError::transport(0, format!("fetch: {e}")))?;
        let h = &resp.headers();
        // Header strings are owned first - the temp Options must outlive
        // the parsed RateHeaders borrow.
        let retry_raw = h.get("retry-after").ok().flatten();
        let ratelimit_raw = match h.get("ratelimit").ok().flatten() {
            Some(v) => Some(v),
            None => h.get("x-ratelimit-remaining").ok().flatten(),
        };
        Ok(CfResponse {
            status: resp.status_code(),
            body: resp
                .text()
                .await
                .map_err(|e| CfError::transport(resp.status_code(), format!("body: {e}")))?,
            retry_after: retry_after_seconds(retry_raw.as_deref()),
            ratelimit_remaining: parse_ratelimit_remaining(ratelimit_raw.as_deref()),
        })
    }
}

// -------------------------------------------------------- retry queue

/// One serial call with the B7 retry queue. On success returns the parsed
/// JSON body; on exhaust the LAST mapped CF error.
pub async fn call_with_retry(cf: &impl Transport, req: CfRequest) -> Result<Value, CfError> {
    call_with_sleeper(cf, req, delay_ms).await
}

/// Same queue with an injectable sleeper (tests pass a no-op so backoff
/// math is asserted without a JS runtime).
pub async fn call_with_sleeper<S, Fut>(
    cf: &impl Transport,
    req: CfRequest,
    sleeper: S,
) -> Result<Value, CfError>
where
    S: Fn(u64) -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    let mut attempt: u32 = 0;
    loop {
        let resp = cf.call(req.clone()).await?;
        if resp.ok() {
            let heads = RateHeaders {
                retry_after: resp.retry_after,
                ratelimit_remaining: resp.ratelimit_remaining,
            };
            let parsed = parse_response(resp.status, &resp.body, &heads)?;
            return Ok(parsed.value);
        }
        let heads = RateHeaders {
            retry_after: resp.retry_after,
            ratelimit_remaining: resp.ratelimit_remaining,
        };
        let cf_err = parse_response(resp.status, &resp.body, &heads)
            .expect_err("failure responses always map to a CF error");
        if attempt < MAX_RETRIES && should_retry(resp.status) {
            let wait = next_backoff_ms(heads.retry_after, attempt);
            sleeper(wait).await;
            attempt += 1;
            continue;
        }
        return Err(cf_err);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cf_error_body_parsed_with_code_and_message() {
        let body = r#"{"success":false,"errors":[{"code":7003,"message":"not found"}]}"#;
        let e = parse_cf_errors(body).expect("error body yields an error");
        assert_eq!(e.code, 7003);
        assert_eq!(e.message, "not found");
        assert_eq!(e.status, 200, "default status used when unspecified");
        assert!(parse_cf_errors(r#"{"success":true}"#).is_none());
        assert!(
            parse_cf_errors("<html>proxy</html>").is_none(),
            "non-json -> None"
        );
        assert!(parse_cf_errors(r#"{"success":false,"errors":[]}"#).is_none());
        let v: Value = serde_json::from_str(body).unwrap();
        let e2 = parse_cf_errors_value(&v, 400).unwrap();
        assert_eq!(e2.status, 400, "transport-level status rides through");
        assert!(!e2.is_rate_limited());
        assert!(CfError::transport(429, "throttled").is_rate_limited());
    }

    /// `parse_response` is the transport-side mapper: 200 + success:false
    /// (D1 style) must be an error too, and 2xx + success:true parses.
    #[test]
    fn parse_response_treats_success_false_as_error() {
        let heads = RateHeaders::default();
        let err = parse_response(
            200,
            r#"{"success":false,"errors":[{"code":7501,"message":"no db"}]}"#,
            &heads,
        )
        .expect_err("success:false fails");
        assert_eq!(err.code, 7501);
        let ok = parse_response(200, r#"{"success":true,"result":{}}"#, &heads).unwrap();
        assert_eq!(ok.value["success"], true);
        assert_eq!(ok.retry_after, None);
        let non_json = parse_response(200, "<html>oops</html>", &heads).expect_err("html fails");
        assert!(non_json.message.contains("non-json cf response"));
        let five_xx = parse_response(502, r#"{"errors":[]}"#, &heads).expect_err("502 fails");
        assert_eq!(five_xx.status, 502);
    }

    #[test]
    fn retry_table_4xx_fail_fast() {
        assert!(should_retry(429));
        for s in [500u16, 502, 503, 529] {
            assert!(should_retry(s), "{s} is transient");
        }
        for s in [400u16, 401, 403, 404, 409, 422, 200] {
            assert!(!should_retry(s), "{s} is deterministic");
        }
    }

    /// B7 math: x2 schedule starting at 2s; `retry-after` honoured but
    /// clamped to the 2..=30 s window.
    #[test]
    fn backoff_schedule_and_clamps() {
        assert_eq!(next_backoff_ms(None, 0), 2_000);
        assert_eq!(next_backoff_ms(None, 1), 4_000);
        assert_eq!(next_backoff_ms(None, 2), 8_000);
        assert_eq!(next_backoff_ms(None, 3), 16_000);
        assert_eq!(next_backoff_ms(None, 5), 30_000, "64s clamps to the cap");
        assert_eq!(next_backoff_ms(Some(1), 0), 2_000, "retry-after below min");
        assert_eq!(next_backoff_ms(Some(9), 0), 9_000, "mid-window honoured");
        assert_eq!(
            next_backoff_ms(Some(60), 0),
            30_000,
            "retry-after above max"
        );
        assert_eq!(next_backoff_ms(Some(u64::MAX), 9), 30_000, "no overflow");
    }

    #[test]
    fn rate_header_parsers() {
        assert_eq!(
            parse_ratelimit_remaining(Some("reset=120;remaining=1198;policy=1200;per=300")),
            Some(1198)
        );
        assert_eq!(parse_ratelimit_remaining(Some("REMAINING=17")), Some(17));
        assert_eq!(parse_ratelimit_remaining(None), None);
        assert_eq!(parse_ratelimit_remaining(Some("reset=120")), None);
        assert_eq!(parse_ratelimit_remaining(Some("remaining=x;")), None);
        assert_eq!(retry_after_seconds(Some(" 8 ")), Some(8));
        assert_eq!(retry_after_seconds(Some("soon")), None);
        assert_eq!(retry_after_seconds(None), None);
    }

    /// The parsed error survives Display as `(code, message, status)` - callers log it into audit.
    #[test]
    fn error_display_includes_code_and_status() {
        let e = CfError {
            code: 11000,
            message: "rate limit exceeded".into(),
            status: 429,
        };
        let s = e.to_string();
        assert!(s.contains("11000") && s.contains("429") && s.contains("rate limit"));
    }
}
