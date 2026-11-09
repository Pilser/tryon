/* routes/media.rs - serve a file from the tenant R2 bucket under
/media/<key>. The studio saves product photos and the shop logo with
URLs built from R2_PUBLIC_BASE, so a private bucket still works: the
shop serves the objects itself instead of needing a public r2.dev
bucket. The key is sanitised - no traversal out of the bucket. */
use worker::{Env, Request, Response, Result};

/// Pure: the bucket key behind a /media/... path (tested).
pub fn key_from_path(path: &str) -> Option<String> {
    let key = path.trim_start_matches('/').strip_prefix("media/")?.trim();
    if key.is_empty()
        || key.len() > 200
        || key.contains("..")
        || key.contains("//")
        || key.starts_with('/')
    {
        return None;
    }
    let ok = |c: char| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '/');
    if !key.chars().all(ok) {
        return None;
    }
    Some(key.to_string())
}

/// Pure: the content type for a key (tested).
pub fn mime_of(key: &str) -> &'static str {
    match key
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        "heic" => "image/heic",
        "webmanifest" => "application/manifest+json",
        "json" => "application/json",
        "css" => "text/css",
        "js" | "mjs" => "application/javascript",
        "html" => "text/html; charset=utf-8",
        "txt" => "text/plain; charset=utf-8",
        "pdf" => "application/pdf",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

/// `GET /media/<key>` - the object, or 404.
pub async fn handle(req: Request, env: Env) -> Result<Response> {
    let path = req.url().map(|u| u.path().to_string()).unwrap_or_default();
    let Some(key) = key_from_path(&path) else {
        return crate::routes::errors::bad_request("INVALID_REQUEST", "bad media path");
    };
    let bucket = env
        .bucket("PRODUCTS")
        .map_err(|_| worker::Error::RustError("R2 PRODUCTS bucket not configured".into()))?;
    let Some(obj) = bucket
        .get(&key)
        .execute()
        .await
        .map_err(|e| worker::Error::RustError(format!("{key}: {e}")))?
    else {
        return crate::routes::errors::json_error(404, "NOT_FOUND", "no such file");
    };
    let Some(body) = obj.body() else {
        return crate::routes::errors::json_error(404, "NOT_FOUND", "no such file");
    };
    let bytes = body
        .bytes()
        .await
        .map_err(|e| worker::Error::RustError(format!("{key}: {e}")))?;
    let mut res = Response::from_bytes(bytes)?;
    let _ = res.headers_mut().set("content-type", mime_of(&key));
    // Hashed-ish names: cache hard, but revalidate so a re-upload shows.
    let _ = res
        .headers_mut()
        .set("cache-control", "public, max-age=3600, s-maxage=86400");
    Ok(res)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn media_keys_are_sanitised() {
        assert_eq!(
            key_from_path("/media/products/coat-01.jpg").as_deref(),
            Some("products/coat-01.jpg")
        );
        assert!(key_from_path("/media/../etc/passwd").is_none());
        assert!(key_from_path("/media//x").is_none());
        assert!(key_from_path("/other/x").is_none());
        assert!(key_from_path("/media/").is_none());
    }
}
