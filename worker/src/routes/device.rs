/* routes/device.rs - device identity + the shared usage tables.
A "user" is a device id (kept in the browser) plus a browser fingerprint
so a fresh browser on the same machine can restore the same id from D1,
plus the WhatsApp number the shopper gives when the free tries run out
(the durable identity, survives any browser change).

This file owns the D1 schema and the small storage helpers the other
usage modules (quota.rs, tokens.rs, usage.rs) build on. */
use serde::{Deserialize, Serialize};
use wasm_bindgen::JsValue;
use worker::{Env, Request, Response};

use crate::routes::errors;

/// Idempotent schema, one statement per element (`exec` takes one at a time).
pub const USAGE_DDL: [&str; 4] = [
    "CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '',
        whatsapp TEXT NOT NULL DEFAULT '',
        bonus INTEGER NOT NULL DEFAULT 0,
        bonus_until_ms INTEGER NOT NULL DEFAULT 0,
        blocked INTEGER NOT NULL DEFAULT 0,
        first_seen_ms INTEGER NOT NULL DEFAULT 0,
        last_seen_ms INTEGER NOT NULL DEFAULT 0
    )",
    "CREATE TABLE IF NOT EXISTS tryons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        product_id TEXT NOT NULL DEFAULT '',
        generation_id TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'free',
        created_ms INTEGER NOT NULL DEFAULT 0
    )",
    "CREATE TABLE IF NOT EXISTS tokens (
        code TEXT PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT 'count',
        value INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        created_ms INTEGER NOT NULL DEFAULT 0,
        redeemed_by TEXT NOT NULL DEFAULT '',
        redeemed_ms INTEGER NOT NULL DEFAULT 0,
        canceled INTEGER NOT NULL DEFAULT 0
    )",
    "CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
    )",
];

/// Columns added after the first release. Existing deployments run these
/// once; a duplicate-column error simply means the column already exists,
/// so migration failures are tolerated in `ensure_ddl`.
pub const USAGE_MIGRATIONS: [&str; 2] = [
    "ALTER TABLE devices ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE tokens ADD COLUMN canceled INTEGER NOT NULL DEFAULT 0",
];

/* ------------------------------------------------------------- pure ----- */

/// Browser device ids are hex-ish and bounded; anything else is rejected.
pub fn clean_device_id(raw: &str) -> Option<String> {
    let id = raw.trim().to_ascii_lowercase();
    if id.len() < 8 || id.len() > 64 {
        return None;
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return None;
    }
    Some(id)
}

/// Stable 16-hex fingerprint of the browser signals we can see. It is a
/// grouping key only: two browsers on one machine look alike, which is how
/// a device id is restored after the browser storage gets wiped.
pub fn fingerprint(parts: &[&str]) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for part in parts {
        for b in part.trim().to_ascii_lowercase().as_bytes() {
            hash ^= *b as u64;
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
        hash ^= 0xff;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

/// Digits-only WhatsApp number (E.164 without `+`).
pub fn clean_whatsapp(raw: &str) -> String {
    raw.chars().filter(|c| c.is_ascii_digit()).collect()
}

pub fn now_ms() -> i64 {
    js_sys::Date::now() as i64
}

/* ---------------------------------------------------------- storage ----- */

#[derive(Deserialize, Default, Clone)]
pub struct DeviceRow {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub whatsapp: String,
    #[serde(default)]
    pub bonus: i64,
    #[serde(default)]
    pub bonus_until_ms: i64,
    #[serde(default)]
    pub blocked: i64,
}

#[derive(Deserialize, Default)]
struct CountRow {
    #[serde(default)]
    n: i64,
}

#[derive(Deserialize, Default)]
struct IdRow {
    #[serde(default)]
    id: String,
}

pub fn db(env: &Env) -> worker::Result<worker::d1::D1Database> {
    env.d1("DB")
        .map_err(|_| worker::Error::RustError("D1 DB not configured".into()))
}

pub async fn ensure_ddl(env: &Env) -> worker::Result<()> {
    let db = db(env)?;
    for sql in USAGE_DDL {
        crate::store::exec_one(&db, sql)
            .await
            .map_err(|e| worker::Error::RustError(e.to_string()))?;
    }
    for sql in USAGE_MIGRATIONS {
        let _ = crate::store::exec_one(&db, sql).await; // duplicate column = already migrated
    }
    Ok(())
}

pub async fn device_row(env: &Env, id: &str) -> Option<DeviceRow> {
    let db = db(env).ok()?;
    db.prepare("SELECT name,whatsapp,bonus,bonus_until_ms,blocked FROM devices WHERE id=?")
        .bind(&[JsValue::from(id.to_string())])
        .ok()?
        .first(None)
        .await
        .ok()
        .flatten()
}

async fn device_for_fingerprint(env: &Env, fp: &str) -> Option<String> {
    let db = db(env).ok()?;
    let row: Option<IdRow> = db
        .prepare("SELECT id FROM devices WHERE fingerprint=? ORDER BY last_seen_ms DESC LIMIT 1")
        .bind(&[JsValue::from(fp.to_string())])
        .ok()?
        .first(None)
        .await
        .ok()
        .flatten();
    row.map(|r| r.id)
}

pub async fn count_tryons(env: &Env, id: &str) -> i64 {
    let Ok(db) = env.d1("DB") else { return 0 };
    let row: Option<CountRow> = match db
        .prepare("SELECT COUNT(*) AS n FROM tryons WHERE device_id=?")
        .bind(&[JsValue::from(id.to_string())])
    {
        Ok(stmt) => stmt.first(None).await.ok().flatten(),
        Err(_) => None,
    };
    row.map(|r| r.n).unwrap_or(0)
}

/// Create the device row when missing and bump `last_seen_ms`. `fp` is only
/// written when known, so a restore keeps the original fingerprint.
pub async fn upsert_device(env: &Env, id: &str, fp: &str, now: i64) {
    let Ok(db) = env.d1("DB") else { return };
    let _ = db
        .prepare(
            "INSERT INTO devices (id,fingerprint,name,whatsapp,bonus,bonus_until_ms,\
             first_seen_ms,last_seen_ms) VALUES (?,?,'','',0,0,?,?) \
             ON CONFLICT(id) DO UPDATE SET \
             fingerprint=CASE WHEN excluded.fingerprint!='' THEN excluded.fingerprint \
                              ELSE devices.fingerprint END,\
             last_seen_ms=excluded.last_seen_ms",
        )
        .bind(&[
            JsValue::from(id.to_string()),
            JsValue::from(fp.to_string()),
            JsValue::from(now),
            JsValue::from(now),
        ])
        .map(|stmt| async move {
            let _ = stmt.run().await;
        });
}

pub async fn set_counters(env: &Env, id: &str, bonus: i64, until: i64, now: i64) {
    let Ok(db) = env.d1("DB") else { return };
    let _ = db
        .prepare("UPDATE devices SET bonus=?,bonus_until_ms=?,last_seen_ms=? WHERE id=?")
        .bind(&[
            JsValue::from(bonus),
            JsValue::from(until),
            JsValue::from(now),
            JsValue::from(id.to_string()),
        ])
        .map(|stmt| async move {
            let _ = stmt.run().await;
        });
}

/// Public shape of a device, safe to send to the browser.
#[derive(Serialize)]
pub struct DeviceSnapshot {
    pub device_id: String,
    pub name: String,
    pub whatsapp: String,
    pub free_tries: i64,
    pub used: i64,
    pub bonus: i64,
    pub bonus_until_ms: i64,
    /// -1 = unlimited (a time token window is open).
    pub remaining: i64,
    pub owner_whatsapp: String,
    /// 1 when the owner blocked this device (no more try-ons).
    pub blocked: i64,
}

pub async fn snapshot(env: &Env, id: &str) -> DeviceSnapshot {
    let q = crate::routes::quota::quota(env, id).await;
    let row = device_row(env, id).await;
    let owner = crate::routes::shop::merged(env).await.owner_whatsapp;
    DeviceSnapshot {
        device_id: id.to_string(),
        name: row.as_ref().map(|r| r.name.clone()).unwrap_or_default(),
        whatsapp: row.as_ref().map(|r| r.whatsapp.clone()).unwrap_or_default(),
        free_tries: q.free_tries,
        used: q.used,
        bonus: q.bonus,
        bonus_until_ms: q.bonus_until_ms,
        remaining: crate::routes::quota::remaining(&q, now_ms()),
        owner_whatsapp: owner,
        blocked: row.as_ref().map(|r| r.blocked).unwrap_or(0),
    }
}

/* --------------------------------------------------------- handlers ----- */

#[derive(Deserialize)]
pub struct RegisterIn {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub fingerprint: String,
}

/// `POST /api/device` - register this browser, or restore the id that was
/// registered for the same fingerprint (new browser, same machine).
pub async fn handle_register(mut req: Request, env: Env) -> worker::Result<Response> {
    let input: RegisterIn = req
        .json()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    ensure_ddl(&env).await?;
    let fp = if input.fingerprint.trim().is_empty() {
        String::new()
    } else {
        fingerprint(&[&input.fingerprint])
    };
    let now = now_ms();
    let mut id = clean_device_id(&input.id).unwrap_or_default();
    if id.is_empty() || device_row(&env, &id).await.is_none() {
        let restored = if fp.is_empty() {
            None
        } else {
            device_for_fingerprint(&env, &fp)
                .await
                .filter(|found| clean_device_id(found).is_some())
        };
        match restored {
            Some(canonical) => id = canonical,
            None if id.is_empty() => id = crate::routes::ids::new_id('d'),
            None => {}
        }
    }
    upsert_device(&env, &id, &fp, now).await;
    Response::from_json(&snapshot(&env, &id).await)
}

#[derive(Deserialize)]
pub struct ContactIn {
    pub device_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub whatsapp: String,
}

/// `POST /api/device/contact` - name + WhatsApp from the quota banner. This
/// is the identity the owner can actually reach, so it survives a wipe.
pub async fn handle_contact(mut req: Request, env: Env) -> worker::Result<Response> {
    let input: ContactIn = req
        .json()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let Some(id) = clean_device_id(&input.device_id) else {
        return errors::bad_request("INVALID_REQUEST", "device_id required");
    };
    let wa = clean_whatsapp(&input.whatsapp);
    if wa.len() < 9 {
        return errors::bad_request("INVALID_WHATSAPP", "enter a full WhatsApp number");
    }
    ensure_ddl(&env).await?;
    let db = db(&env)?;
    db.prepare("UPDATE devices SET name=?,whatsapp=?,last_seen_ms=? WHERE id=?")
        .bind(&[
            JsValue::from(input.name.trim().to_string()),
            JsValue::from(wa),
            JsValue::from(now_ms()),
            JsValue::from(id.clone()),
        ])
        .map_err(|e| worker::Error::RustError(e.to_string()))?
        .run()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    Response::from_json(&snapshot(&env, &id).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_ids_are_checked() {
        assert_eq!(clean_device_id("  ABCDEF12 ").as_deref(), Some("abcdef12"));
        assert!(clean_device_id("short").is_none());
        assert!(clean_device_id("has space here").is_none());
        assert!(clean_device_id(&"x".repeat(80)).is_none());
    }

    #[test]
    fn fingerprints_are_stable_and_split_browsers() {
        let a = fingerprint(&["Mozilla/5.0", "390x844", "Africa/Kampala"]);
        assert_eq!(
            a,
            fingerprint(&["mozilla/5.0 ", "390X844", "africa/kampala"])
        );
        assert_ne!(
            a,
            fingerprint(&["Mozilla/5.0", "1280x900", "Africa/Kampala"])
        );
        assert_eq!(a.len(), 16);
    }

    #[test]
    fn whatsapp_keeps_digits_only() {
        assert_eq!(clean_whatsapp("+256 772-000 111"), "256772000111");
    }
}
