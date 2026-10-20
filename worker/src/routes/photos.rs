/* routes/photos.rs - per-device photo backup in object storage (R2).
Shoppers' picked photos are backed up under a per-device folder so the
owner can see what each device keeps and delete the old ones (folder
filters, not one button per file) - that is how the bucket stays small.

Layout: `people/<device_id>/<created_ms>-<rand>.<ext>`, and one D1 row
per object (`device_photos`) so the dashboard can size each device
without listing the bucket. */
use serde::{Deserialize, Serialize};
use wasm_bindgen::JsValue;
use worker::{Env, HttpMetadata, Request, Response};

use crate::routes::device;
use crate::routes::errors;

/// Every backup starts with this prefix: keys outside it are never touched.
pub const PHOTO_PREFIX: &str = "people/";
/// Photos kept per device: the oldest is pruned past this, so one device
/// cannot fill the bucket however many times it re-picks a photo.
pub const MAX_PER_DEVICE: i64 = 60;
/// Object storage lives beside product images (one bucket, prefixes).
const BUCKET: &str = "PRODUCTS";

pub const PHOTO_DDL: [&str; 1] = ["CREATE TABLE IF NOT EXISTS device_photos (\
        key TEXT PRIMARY KEY,\
        device_id TEXT NOT NULL DEFAULT '',\
        bytes INTEGER NOT NULL DEFAULT 0,\
        mime TEXT NOT NULL DEFAULT '',\
        created_ms INTEGER NOT NULL DEFAULT 0\
    )"];

/* ------------------------------------------------------------- pure ----- */

/// Extension for an accepted image mime (defaults to jpg).
pub fn ext_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/webp" => "webp",
        _ => "jpg",
    }
}

/// Object key: `people/<device>/<created_ms>-<rand>.<ext>` (pure, tested).
pub fn photo_key(device_id: &str, created_ms: i64, rand: u32, mime: &str) -> String {
    format!(
        "{}{}/{}-{}.{}",
        PHOTO_PREFIX,
        device_id,
        created_ms,
        rand,
        ext_for_mime(mime)
    )
}

/// A key we are willing to read or delete: it must live under the people
/// prefix and stay inside its folder (no traversal, no product images).
/// Tenant shops namespace keys under `shops/<shop-id>/…`, so the
/// namespace is stripped for validation and kept in the returned key.
pub fn clean_stored_key(raw: &str) -> Option<String> {
    let key = raw.trim();
    if key.len() > 200 {
        return None;
    }
    let logical = match key.strip_prefix("shops/") {
        Some(rest) => {
            let (shop, tail) = rest.split_once('/')?;
            if shop.is_empty() {
                return None;
            }
            tail
        }
        None => key,
    };
    if !logical.starts_with(PHOTO_PREFIX) {
        return None;
    }
    if key.contains("..") || key.ends_with('/') {
        return None;
    }
    let body = &logical[PHOTO_PREFIX.len()..];
    let (device, rest) = body.split_once('/')?;
    if device.is_empty() || rest.is_empty() || rest.contains('/') {
        return None;
    }
    let ok = |c: char| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' || c == '/';
    if !key.chars().all(ok) {
        return None;
    }
    Some(key.to_string())
}

/// Cutoff for "older than N days" (0 days = everything is old enough).
pub fn older_than_cutoff(now_ms: i64, days: i64) -> i64 {
    let days = days.clamp(0, 3650);
    now_ms - days * 24 * 60 * 60 * 1000
}

/* ------------------------------------------------------------ setup ----- */

pub async fn ensure_ddl(env: &Env) -> worker::Result<()> {
    let db = device::db(env)?;
    for sql in PHOTO_DDL {
        let _ = crate::store::exec_one(&db, sql).await; // idempotent; missing R2 must not kill it
    }
    Ok(())
}

fn bucket(env: &Env) -> worker::Result<worker::Bucket> {
    env.bucket(BUCKET)
        .map_err(|_| worker::Error::RustError("R2 bucket not configured".into()))
}

#[derive(Deserialize, Serialize, Default, Clone)]
pub struct PhotoRow {
    pub key: String,
    #[serde(default)]
    pub bytes: i64,
    #[serde(default)]
    pub mime: String,
    #[serde(default)]
    pub created_ms: i64,
}

/* --------------------------------------------------------- shopper ------ */

/// `POST /api/device/photos` - back up one picked photo. Raw image body,
/// `content-type: image/*`, `x-device-id: <id>`. The oldest photo of that
/// device is pruned past `MAX_PER_DEVICE`, so storage stays bounded.
pub async fn handle_backup(mut req: Request, env: Env) -> worker::Result<Response> {
    let raw_id = req.headers().get("x-device-id")?.unwrap_or_default();
    let Some(id) = device::clean_device_id(&raw_id) else {
        return errors::bad_request("INVALID_REQUEST", "x-device-id required");
    };
    let mime = req
        .headers()
        .get("content-type")?
        .unwrap_or_default()
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    let bytes = req
        .bytes()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    if let Err(e) = crate::routes::person::check_file_part(&mime, bytes.len()) {
        return errors::bad_request("INVALID_UPLOAD", e);
    }
    device::ensure_ddl(&env).await?;
    ensure_ddl(&env).await?;
    if env.d1("DB").is_err() {
        return errors::not_configured("photo backup needs D1");
    }
    let db = device::db(&env)?;
    let now = device::now_ms();
    let rand = (js_sys::Math::random() * (u32::MAX as f64)) as u32;
    let key = crate::tenant::apply_prefix(
        &crate::tenant::r2_prefix(&env),
        &photo_key(&id, now, rand, &mime),
    );
    bucket(&env)?
        .put(key.clone(), bytes.clone())
        .http_metadata(HttpMetadata {
            content_type: Some(mime.clone()),
            ..Default::default()
        })
        .execute()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    db.prepare("INSERT OR REPLACE INTO device_photos (key,device_id,bytes,mime,created_ms) VALUES (?,?,?,?,?)")
        .bind(&[
            JsValue::from(key.clone()),
            JsValue::from(id.clone()),
            JsValue::from(bytes.len() as i64),
            JsValue::from(mime.clone()),
            JsValue::from(now),
        ])
        .map_err(|e| worker::Error::RustError(e.to_string()))?
        .run()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let pruned = prune_device(&env, &id).await.unwrap_or(0);
    Response::from_json(&serde_json::json!({
        "ok": true,
        "key": key,
        "bytes": bytes.len(),
        "pruned": pruned,
    }))
}

/// Drop this device's oldest photos beyond the cap (row + object).
async fn prune_device(env: &Env, id: &str) -> worker::Result<i64> {
    let db = device::db(env)?;
    let rows: Vec<PhotoRow> = db
        .prepare("SELECT key,bytes,mime,created_ms FROM device_photos WHERE device_id=? ORDER BY created_ms DESC LIMIT 400")
        .bind(&[JsValue::from(id.to_string())])
        .map_err(|e| worker::Error::RustError(e.to_string()))?
        .all()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?
        .results()
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let mut dropped = 0;
    for row in rows.into_iter().skip(MAX_PER_DEVICE as usize) {
        delete_keys(env, &[row.key]).await?;
        dropped += 1;
    }
    Ok(dropped)
}

/// Delete objects (best effort) and their rows. Errors on R2 are ignored so
/// a missing object never blocks the D1 cleanup.
async fn delete_keys(env: &Env, keys: &[String]) -> worker::Result<()> {
    let db = device::db(env)?;
    if let Ok(b) = bucket(env) {
        for key in keys {
            let _ = b.delete(key.clone()).await;
        }
    }
    for key in keys {
        db.prepare("DELETE FROM device_photos WHERE key=?")
            .bind(&[JsValue::from(key.clone())])
            .map_err(|e| worker::Error::RustError(e.to_string()))?
            .run()
            .await
            .map_err(|e| worker::Error::RustError(e.to_string()))?;
    }
    Ok(())
}

/* ----------------------------------------------------------- owner ------ */

async fn rows_for(env: &Env, device_id: Option<&str>) -> worker::Result<Vec<PhotoRow>> {
    let db = device::db(env)?;
    let stmt = match device_id {
        Some(_) => db.prepare(
            "SELECT key,bytes,mime,created_ms FROM device_photos WHERE device_id=? \
             ORDER BY created_ms DESC LIMIT 500",
        ),
        None => db.prepare(
            "SELECT key,bytes,mime,created_ms FROM device_photos \
             ORDER BY created_ms DESC LIMIT 500",
        ),
    };
    let bound = match device_id {
        Some(id) => stmt.bind(&[JsValue::from(id.to_string())]),
        None => stmt.bind(&[]),
    }
    .map_err(|e| worker::Error::RustError(e.to_string()))?;
    bound
        .all()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?
        .results()
        .map_err(|e| worker::Error::RustError(e.to_string()))
}

#[derive(Serialize)]
struct PhotoList {
    device_id: String,
    count: i64,
    bytes: i64,
    photos: Vec<PhotoRow>,
}

/// `GET /api/studio/photos?device_id=..` - one device's folder, newest
/// first (omit `device_id` for every device, capped at 500).
pub async fn handle_list(req: Request, env: Env) -> worker::Result<Response> {
    if !crate::routes::owner::authorized(&req, &env) {
        return errors::unauthorized();
    }
    let wanted = req
        .url()
        .ok()
        .and_then(|u| {
            u.query_pairs()
                .find(|(k, _)| k == "device_id")
                .map(|(_, v)| v.to_string())
        })
        .and_then(|v| device::clean_device_id(&v));
    ensure_ddl(&env).await?;
    let rows = rows_for(&env, wanted.as_deref()).await?;
    let bytes = rows.iter().map(|r| r.bytes).sum();
    Response::from_json(&PhotoList {
        device_id: wanted.unwrap_or_default(),
        count: rows.len() as i64,
        bytes,
        photos: rows,
    })
}

/// `GET /api/studio/photo?key=..` - stream one backed-up photo (owner only;
/// they are not public, unlike product images).
pub async fn handle_get(req: Request, env: Env) -> worker::Result<Response> {
    if !crate::routes::owner::authorized(&req, &env) {
        return errors::unauthorized();
    }
    let key = req
        .url()
        .ok()
        .and_then(|u| {
            u.query_pairs()
                .find(|(k, _)| k == "key")
                .map(|(_, v)| v.to_string())
        })
        .and_then(|v| clean_stored_key(&v));
    let Some(key) = key else {
        return errors::bad_request("INVALID_REQUEST", "key required");
    };
    let obj = bucket(&env)?
        .get(key)
        .execute()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let Some(obj) = obj else {
        return errors::json_error(404, "NOT_FOUND", "photo not found");
    };
    let mime = obj
        .http_metadata()
        .content_type
        .unwrap_or_else(|| "image/jpeg".into());
    let body = obj
        .body()
        .and_then(|b| b.response_body().ok())
        .ok_or_else(|| worker::Error::RustError("photo body unavailable".into()))?;
    let mut headers = worker::Headers::new();
    headers.set("content-type", &mime)?;
    headers.set("cache-control", "private, max-age=300")?;
    Response::from_body(body).map(|r| r.with_headers(headers))
}

#[derive(Deserialize)]
pub struct DeleteIn {
    /// Optional: scope the delete to one device folder.
    #[serde(default)]
    pub device_id: String,
    /// `old` deletes rows older than `days` (default 30), `all` everything.
    pub filter: String,
    #[serde(default)]
    pub days: i64,
}

/// `POST /api/studio/photos/delete` - folder-style cleanup: everything, or
/// only what is older than N days, for one device or for all of them.
pub async fn handle_delete(mut req: Request, env: Env) -> worker::Result<Response> {
    if !crate::routes::owner::authorized(&req, &env) {
        return errors::unauthorized();
    }
    let input: DeleteIn = req
        .json()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let device_id = device::clean_device_id(&input.device_id);
    if !input.device_id.trim().is_empty() && device_id.is_none() {
        return errors::bad_request("INVALID_REQUEST", "bad device_id");
    }
    let days = if input.days > 0 { input.days } else { 30 };
    let cutoff = older_than_cutoff(device::now_ms(), days);
    let (scope, arg): (&str, Option<i64>) = match (input.filter.as_str(), device_id.as_deref()) {
        ("old", Some(_)) => ("device_id=? AND created_ms<?", Some(cutoff)),
        ("old", None) => ("created_ms<?", Some(cutoff)),
        ("all", Some(_)) => ("device_id=?", None),
        ("all", None) => ("1=1", None),
        _ => return errors::bad_request("INVALID_REQUEST", "filter must be all|old"),
    };
    ensure_ddl(&env).await?;
    let db = device::db(&env)?;
    let sql =
        format!("SELECT key,bytes,mime,created_ms FROM device_photos WHERE {scope} LIMIT 500");
    let mut binds: Vec<JsValue> = Vec::new();
    if let Some(id) = device_id.as_deref() {
        binds.push(JsValue::from(id.to_string()));
    }
    if let Some(c) = arg {
        binds.push(JsValue::from(c));
    }
    let rows: Vec<PhotoRow> = db
        .prepare(sql)
        .bind(&binds)
        .map_err(|e| worker::Error::RustError(e.to_string()))?
        .all()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?
        .results()
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let keys: Vec<String> = rows.iter().map(|r| r.key.clone()).collect();
    let freed: i64 = rows.iter().map(|r| r.bytes).sum();
    delete_keys(&env, &keys).await?;
    Response::from_json(&serde_json::json!({
        "ok": true,
        "deleted": keys.len(),
        "freed": freed,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_live_under_the_device_folder() {
        let k = photo_key("a1b2c3d4", 1_760_000_000_000, 7, "image/png");
        assert_eq!(k, "people/a1b2c3d4/1760000000000-7.png");
        assert!(photo_key("a1b2c3d4", 1, 1, "image/jpeg").ends_with(".jpg"));
        assert!(photo_key("a1b2c3d4", 1, 1, "image/webp").ends_with(".webp"));
    }

    #[test]
    fn stored_keys_are_sandboxed_to_people() {
        assert!(clean_stored_key("people/a1b2c3d4/1760000000000-7.jpg").is_some());
        // Product images and anything outside the prefix stay untouchable.
        assert!(clean_stored_key("products/coat-01.jpg").is_none());
        assert!(clean_stored_key("people/../../etc/passwd").is_none());
        assert!(clean_stored_key("people/a1b2c3d4/").is_none());
        assert!(clean_stored_key("people/a1b2c3d4/sub/dir.jpg").is_none());
        assert!(clean_stored_key("people//x.jpg").is_none());
        assert!(clean_stored_key("people/a1b2c3d4/x y.jpg").is_none());
    }

    #[test]
    fn tenant_namespaced_keys_validate_after_the_prefix() {
        // Tenant shops store people photos under `shops/<id>/people/…`.
        assert!(clean_stored_key("shops/ab12cd34/people/a1b2c3d4/1760000000000-7.jpg").is_some());
        // The namespace does not widen what is readable.
        assert!(clean_stored_key("shops/ab12cd34/products/coat-01.jpg").is_none());
        assert!(clean_stored_key("shops//people/a1b2c3d4/1-7.jpg").is_none());
        assert!(clean_stored_key("shops/ab12cd34/people/../../etc/passwd").is_none());
        assert!(clean_stored_key("shops/ab12cd34").is_none());
    }

    #[test]
    fn cutoff_moves_back_by_days() {
        let day = 24 * 60 * 60 * 1000;
        assert_eq!(older_than_cutoff(10 * day, 3), 7 * day);
        assert_eq!(older_than_cutoff(10 * day, 0), 10 * day);
        // Out-of-range day counts are clamped, never negative-time nonsense.
        assert_eq!(older_than_cutoff(day, -5), day);
        assert!(older_than_cutoff(day, 5000) < day - 3000 * day);
    }
}
