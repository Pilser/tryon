/* routes/quota.rs - the free try-on allowance: how many a device may make,
when a redeemed token pays instead, and the gate/record pair the try-on
routes call. Counters live in D1 only (see device.rs schema):
`used` = COUNT(*) of the tryons log, `bonus` = unused redeemed try-ons,
`bonus_until_ms` = end of an unlimited window from a time token. */
use serde::{Deserialize, Serialize};
use wasm_bindgen::JsValue;
use worker::{Env, Request, Response};

use crate::routes::device;
use crate::routes::errors;

/// Free try-ons every new device starts with (owner can change it).
pub const FREE_TRIES_DEFAULT: i64 = 3;

/// What the server knows about one device's allowance.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Quota {
    pub free_tries: i64,
    pub used: i64,
    pub bonus: i64,
    pub bonus_until_ms: i64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Verdict {
    /// `from_bonus` = the free allowance was spent, a token paid for this.
    Allowed {
        from_bonus: bool,
    },
    Exhausted,
}

/// Time tokens mean "unlimited while the window is open".
pub fn window_open(q: &Quota, now_ms: i64) -> bool {
    q.bonus_until_ms > now_ms
}

pub fn verdict(q: &Quota, now_ms: i64) -> Verdict {
    if window_open(q, now_ms) {
        return Verdict::Allowed { from_bonus: true };
    }
    if q.free_tries - q.used > 0 {
        Verdict::Allowed { from_bonus: false }
    } else if q.bonus > 0 {
        Verdict::Allowed { from_bonus: true }
    } else {
        Verdict::Exhausted
    }
}

/// Try-ons left, or `-1` while a time token keeps the window open.
pub fn remaining(q: &Quota, now_ms: i64) -> i64 {
    if window_open(q, now_ms) {
        return -1;
    }
    (q.free_tries - q.used).max(0) + q.bonus
}

/// Which allowance this try-on spends (and the counters to write back).
/// `None` = nothing left, the caller must block.
pub fn seal(q: &Quota, now_ms: i64) -> Option<(i64, i64, &'static str)> {
    if window_open(q, now_ms) {
        return Some((q.bonus, q.bonus_until_ms, "window"));
    }
    if q.free_tries - q.used > 0 {
        return Some((q.bonus, q.bonus_until_ms, "free"));
    }
    if q.bonus > 0 {
        return Some((q.bonus - 1, q.bonus_until_ms, "bonus"));
    }
    None
}

/* ---------------------------------------------------------- storage ----- */

/// Owner-set allowance (settings row), defaulting to FREE_TRIES_DEFAULT.
pub async fn free_tries(env: &Env) -> i64 {
    #[derive(Deserialize, Default)]
    struct SettingRow {
        #[serde(default)]
        value: String,
    }
    let Ok(db) = env.d1("DB") else {
        return FREE_TRIES_DEFAULT;
    };
    let row: Option<SettingRow> = match db
        .prepare("SELECT value FROM settings WHERE key='free_tries'")
        .first(None)
        .await
    {
        Ok(row) => row,
        Err(_) => None,
    };
    row.and_then(|r| r.value.trim().parse::<i64>().ok())
        .filter(|v| *v >= 0)
        .unwrap_or(FREE_TRIES_DEFAULT)
}

pub async fn quota(env: &Env, id: &str) -> Quota {
    let row = device::device_row(env, id).await;
    Quota {
        free_tries: free_tries(env).await,
        used: device::count_tryons(env, id).await,
        bonus: row.as_ref().map(|r| r.bonus).unwrap_or(0),
        bonus_until_ms: row.as_ref().map(|r| r.bonus_until_ms).unwrap_or(0),
    }
}

/* --------------------------------------------------------- handlers ----- */

/// Gate one try-on: `None` = go ahead, `Some(_)` = answer the client now.
/// A spent allowance is a 402 with the allowance details bolted onto the
/// usual error body, so the banner can render without a second request.
pub async fn gate(env: &Env, device_id: &str) -> worker::Result<Option<Response>> {
    let Some(id) = device::clean_device_id(device_id) else {
        return Ok(Some(errors::bad_request(
            "DEVICE_REQUIRED",
            "device_id required for try-on",
        )?));
    };
    if env.d1("DB").is_err() {
        return Ok(None); // no D1 wired (local rig): stay permissive
    }
    let row = device::device_row(env, &id).await;
    if row.as_ref().map(|r| r.blocked).unwrap_or(0) > 0 {
        // The owner blocked this device. Same error shape, no unlock path.
        let snap = device::snapshot(env, &id).await;
        let mut body =
            serde_json::to_value(&snap).map_err(|e| worker::Error::RustError(e.to_string()))?;
        if let Some(map) = body.as_object_mut() {
            map.insert("code".into(), serde_json::json!("BLOCKED"));
            map.insert(
                "message".into(),
                serde_json::json!("this device was blocked by the shop - contact them on WhatsApp"),
            );
            map.insert("status".into(), serde_json::json!(403));
        }
        return Ok(Some(Response::from_json(&body)?.with_status(403)));
    }
    let q = quota(env, &id).await;
    if verdict(&q, device::now_ms()) != Verdict::Exhausted {
        return Ok(None);
    }
    let snap = device::snapshot(env, &id).await;
    let mut body =
        serde_json::to_value(&snap).map_err(|e| worker::Error::RustError(e.to_string()))?;
    if let Some(map) = body.as_object_mut() {
        map.insert("code".into(), serde_json::json!("QUOTA_EXCEEDED"));
        map.insert(
            "message".into(),
            serde_json::json!("free try-ons used up - ask the shop for an unlock code"),
        );
        map.insert("status".into(), serde_json::json!(402));
    }
    Ok(Some(Response::from_json(&body)?.with_status(402)))
}

/// Record a successful try-on (only after Genlook accepted it).
pub async fn record(env: &Env, device_id: &str, product_id: &str, generation_id: &str) {
    let Some(id) = device::clean_device_id(device_id) else {
        return;
    };
    let now = device::now_ms();
    let q = quota(env, &id).await;
    let Some((bonus, until, source)) = seal(&q, now) else {
        return;
    };
    if let Ok(db) = env.d1("DB") {
        let _ = db
            .prepare(
                "INSERT INTO tryons (device_id,product_id,generation_id,source,created_ms) \
                 VALUES (?,?,?,?,?)",
            )
            .bind(&[
                JsValue::from(id.clone()),
                JsValue::from(product_id.to_string()),
                JsValue::from(generation_id.to_string()),
                JsValue::from(source.to_string()),
                JsValue::from(now),
            ])
            .map(|stmt| async move {
                let _ = stmt.run().await;
            });
    }
    device::set_counters(env, &id, bonus, until, now).await;
}

#[derive(Deserialize)]
pub struct SettingsIn {
    pub free_tries: i64,
}

/// `POST /api/studio/settings` - free try-ons given to every device.
pub async fn handle_settings(mut req: Request, env: Env) -> worker::Result<Response> {
    if !crate::routes::owner::authorized(&req, &env) {
        return errors::unauthorized();
    }
    let input: SettingsIn = req
        .json()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let free = input.free_tries.clamp(0, 1_000);
    device::ensure_ddl(&env).await?;
    let db = device::db(&env)?;
    db.prepare(
        "INSERT INTO settings (key,value) VALUES ('free_tries',?) \
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .bind(&[JsValue::from(free.to_string())])
    .map_err(|e| worker::Error::RustError(e.to_string()))?
    .run()
    .await
    .map_err(|e| worker::Error::RustError(e.to_string()))?;
    Response::from_json(&serde_json::json!({ "free_tries": free }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quota_maths_covers_free_bonus_and_windows() {
        let now = 1_000_000;
        let fresh = Quota {
            free_tries: 3,
            used: 0,
            bonus: 0,
            bonus_until_ms: 0,
        };
        assert_eq!(verdict(&fresh, now), Verdict::Allowed { from_bonus: false });
        assert_eq!(remaining(&fresh, now), 3);
        assert_eq!(seal(&fresh, now), Some((0, 0, "free")));

        let spent = Quota { used: 3, ..fresh };
        assert_eq!(verdict(&spent, now), Verdict::Exhausted);
        assert_eq!(remaining(&spent, now), 0);
        assert_eq!(seal(&spent, now), None);

        let paid = Quota { bonus: 2, ..spent };
        assert_eq!(verdict(&paid, now), Verdict::Allowed { from_bonus: true });
        assert_eq!(remaining(&paid, now), 2);
        // A paid try-on spends the bonus, not the free allowance.
        assert_eq!(seal(&paid, now), Some((1, 0, "bonus")));

        let window = Quota {
            bonus: 0,
            bonus_until_ms: now + 5,
            ..spent
        };
        assert_eq!(verdict(&window, now), Verdict::Allowed { from_bonus: true });
        assert_eq!(remaining(&window, now), -1);
        assert_eq!(seal(&window, now), Some((0, now + 5, "window")));
        assert_eq!(verdict(&window, now + 6), Verdict::Exhausted);
    }
}
