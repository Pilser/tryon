/* routes/remote-image.rs - fetch a remote image (Genlook's GCS bucket)
   server-side so the shop's frontend can read it without CORS. The
   browser cannot fetch https://storage.googleapis.com/… directly (GCS
   sends no Access-Control-Allow-Origin), but our Worker can fetch it and
   return the bytes with permissive CORS instead.
   Security: only HTTPS, and only hosts in the allowlist (the Genlook
   signed-URL bucket). Never an open proxy. */
use worker::{Env, Fetch, Request, RequestInit, Response, Result};

/// Hosts this proxy will fetch from. Genlook's generated/customer images
/// live on GCS (`storage.googleapis.com/genlook-cabin/…`).
const ALLOWED_HOSTS: [&str; 1] = ["storage.googleapis.com"];

/// Pure: does the URL pass the allowlist? (tested)
pub fn allowed_url(u: &str) -> bool {
    let Some(url) = worker::Url::parse(u).ok() else {
        return false;
    };
    if url.scheme() != "https" {
        return false;
    }
    let host = url.host_str().unwrap_or("");
    ALLOWED_HOSTS.iter().any(|h| host == *h || host.ends_with(&format!(".{h}")))
}

/// `GET /api/remote-image?u=<encoded url>` — the bytes with CORS.
pub async fn handle(req: Request, _env: Env) -> Result<Response> {
    let u = req
        .url()?
        .query_pairs()
        .find(|(k, _)| k == "u")
        .map(|(_, v)| v.into_owned())
        .unwrap_or_default();
    if u.is_empty() || !allowed_url(&u) {
        return crate::routes::errors::bad_request("INVALID_REQUEST", "disallowed remote image url");
    }
    let mut init = RequestInit::new();
    init.with_method(worker::Method::Get);
    let upstream = Request::new_with_init(&u, &init)?;
    let mut resp = Fetch::Request(upstream).send().await?;
    if resp.status_code() != 200 {
        return crate::routes::errors::json_error(
            502,
            "REMOTE_IMAGE_FAILED",
            &format!("remote image answered {}", resp.status_code()),
        );
    }
    let bytes = resp.bytes().await.map_err(|e| worker::Error::RustError(e.to_string()))?;
    let ct = resp
        .headers()
        .get("content-type")?
        .unwrap_or_else(|| "application/octet-stream".into());
    // GCS images are immutable-ish signed URLs: cache briefly on repeat views.
    let mut out = Response::from_bytes(bytes)?;
    let _ = out.headers_mut().set("content-type", &ct);
    let _ = out.headers_mut().set("access-control-allow-origin", "*");
    let _ = out.headers_mut().set("cache-control", "public, max-age=300");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowlist_https_gcs_only() {
        assert!(allowed_url("https://storage.googleapis.com/genlook-cabin/ephemeral/generated/ttl-7d/x/y.jpeg?X-Goog-Signature=abc"));
        assert!(!allowed_url("http://storage.googleapis.com/x")); // not https
        assert!(!allowed_url("https://example.com/x"));            // not allowlisted
        assert!(!allowed_url("https://storage.googleapis.com.evil.com/x")); // host suffix trap
        assert!(!allowed_url("not a url"));
        assert!(!allowed_url(""));
    }
}
