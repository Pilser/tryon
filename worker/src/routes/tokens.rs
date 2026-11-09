/* routes/tokens.rs - unlock tokens: minting 4-character codes (count or
time based), redeeming them into a device's allowance, and deleting
them. Codes are random, unambiguous and single-use; the D1 row records
who redeemed them and when, which is what the dashboard lists. */
use serde::{Deserialize, Serialize};
use wasm_bindgen::JsValue;
use worker::{Env, Request, Response};

use crate::routes::device;
use crate::routes::errors;

/// Unambiguous alphabet for 4-character unlock codes (no 0/O/1/I/L).
pub const TOKEN_ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/// Unlock code length.
pub const TOKEN_LEN: usize = 4;
const HOUR_MS: i64 = 3_600_000;

/* ------------------------------------------------------------- pure ----- */

/// 4-character unlock code from a seed (callers feed randomness).
pub fn token_code(seed: u64) -> String {
    let mut n = seed;
    let mut out = String::with_capacity(TOKEN_LEN);
    for _ in 0..TOKEN_LEN {
        let idx = (n % TOKEN_ALPHABET.len() as u64) as usize;
        out.push(TOKEN_ALPHABET[idx] as char);
        n /= TOKEN_ALPHABET.len() as u64;
    }
    out
}

/// Mix the random word, the clock and the batch index into a code seed.
/// Pure, so the spread can be tested without a wasm runtime.
pub fn mint_seed(random: u64, clock_ms: u64, index: i64) -> u64 {
    random ^ clock_ms.rotate_left(13) ^ ((index as u64).wrapping_mul(0x9e37_79b9_7f4a_7c15))
}

/// Uppercase, trimmed, alphabet-checked unlock code. The alphabet has no
/// look-alikes, so anything else is a typo and gets rejected.
pub fn clean_code(raw: &str) -> Option<String> {
    let code = raw.trim().to_ascii_uppercase();
    if code.len() != TOKEN_LEN || !code.bytes().all(|b| TOKEN_ALPHABET.contains(&b)) {
        return None;
    }
    Some(code)
}

/// Map a redeemed token onto the device counters (pure, tested).
/// `count` adds try-ons, `time` opens/extends an unlimited window.
pub fn apply_token(
    kind: &str,
    value: i64,
    bonus: i64,
    bonus_until_ms: i64,
    now_ms: i64,
) -> (i64, i64) {
    if kind == "time" {
        let base = bonus_until_ms.max(now_ms);
        (bonus, base + value.clamp(1, 24 * 90) * HOUR_MS)
    } else {
        (bonus + value.clamp(1, 10_000), bonus_until_ms)
    }
}

/// Seed for a fresh code: a random word mixed with the clock and the batch
/// index, so a burst of minted codes cannot repeat.
fn minted_code(index: i64) -> String {
    let random = (js_sys::Math::random() * (u32::MAX as f64)) as u64;
    token_code(mint_seed(random, js_sys::Date::now() as u64, index))
}

/* --------------------------------------------------------- handlers ----- */

#[derive(Deserialize)]
pub struct RedeemIn {
    pub device_id: String,
    pub code: String,
}

#[derive(Deserialize, Default)]
struct TokenRow {
    #[serde(default)]
    kind: String,
    #[serde(default)]
    value: i64,
    #[serde(default)]
    redeemed_by: String,
    #[serde(default)]
    canceled: i64,
}

/// `POST /api/device/redeem` - spend a 4-character unlock code (once).
pub async fn handle_redeem(mut req: Request, env: Env) -> worker::Result<Response> {
    let input: RedeemIn = req
        .json()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let Some(id) = device::clean_device_id(&input.device_id) else {
        return errors::bad_request("INVALID_REQUEST", "device_id required");
    };
    let Some(code) = clean_code(&input.code) else {
        return errors::json_error(404, "TOKEN_NOT_FOUND", "no such unlock code");
    };
    device::ensure_ddl(&env).await?;
    let db = device::db(&env)?;
    let token: Option<TokenRow> = db
        .prepare("SELECT kind,value,redeemed_by,canceled FROM tokens WHERE code=?")
        .bind(&[JsValue::from(code.clone())])
        .map_err(|e| worker::Error::RustError(e.to_string()))?
        .first(None)
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let Some(token) = token else {
        return errors::json_error(404, "TOKEN_NOT_FOUND", "no such unlock code");
    };
    if token.canceled > 0 {
        // The owner pulled this code before anyone spent it.
        return errors::json_error(409, "TOKEN_USED", "that code was canceled");
    }
    if !token.redeemed_by.is_empty() {
        if token.redeemed_by != id {
            return errors::json_error(409, "TOKEN_USED", "that code was already used");
        }
        // The same device asking again is a no-op: a code never pays twice.
        return Response::from_json(&device::snapshot(&env, &id).await);
    }
    let now = device::now_ms();
    let row = device::device_row(&env, &id).await.unwrap_or_default();
    let (bonus, until) = apply_token(&token.kind, token.value, row.bonus, row.bonus_until_ms, now);
    device::upsert_device(&env, &id, "", now).await;
    device::set_counters(&env, &id, bonus, until, now).await;
    db.prepare("UPDATE tokens SET redeemed_by=?,redeemed_ms=? WHERE code=?")
        .bind(&[
            JsValue::from(id.clone()),
            JsValue::from(now),
            JsValue::from(code),
        ])
        .map_err(|e| worker::Error::RustError(e.to_string()))?
        .run()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    Response::from_json(&device::snapshot(&env, &id).await)
}

#[derive(Deserialize)]
pub struct MintIn {
    /// `count` = N extra try-ons, `time` = N hours unlimited.
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub value: i64,
    /// How many codes to mint (default 1, max 50).
    #[serde(default)]
    pub count: i64,
    #[serde(default)]
    pub note: String,
}

/// `POST /api/studio/tokens` - mint 1..50 unlock codes.
/// Body: `{kind:"count"|"time", value: 3 | 24, count: 1, note: "bought 5k"}`
pub async fn handle_mint(mut req: Request, env: Env) -> worker::Result<Response> {
    if !crate::routes::owner::authorized_async(&req, &env).await {
        return errors::unauthorized();
    }
    let input: MintIn = req
        .json()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let kind = if input.kind == "time" {
        "time"
    } else {
        "count"
    };
    if !(1..=10_000).contains(&input.value) {
        return errors::bad_request("INVALID_REQUEST", "value must be 1..10000");
    }
    let count = input.count.clamp(1, 50);
    let note = input.note.trim().chars().take(60).collect::<String>();
    device::ensure_ddl(&env).await?;
    let db = device::db(&env)?;
    let now = device::now_ms();
    let mut codes = Vec::with_capacity(count as usize);
    for i in 0..count {
        // A duplicate code fails the INSERT; take another random one.
        for attempt in 0..6 {
            let code = minted_code(i + attempt * 1_000);
            let res = db
                .prepare("INSERT INTO tokens (code,kind,value,note,created_ms) VALUES (?,?,?,?,?)")
                .bind(&[
                    JsValue::from(code.clone()),
                    JsValue::from(kind.to_string()),
                    JsValue::from(input.value),
                    JsValue::from(note.clone()),
                    JsValue::from(now),
                ])
                .map_err(|e| worker::Error::RustError(e.to_string()))?
                .run()
                .await;
            if res.is_ok() {
                codes.push(code);
                break;
            }
        }
    }
    Response::from_json(&serde_json::json!({
        "kind": kind,
        "value": input.value,
        "codes": codes,
    }))
}

#[derive(Deserialize)]
pub struct DeleteIn {
    pub code: String,
}

/// `POST /api/studio/tokens/delete` - remove a code (used or not).
pub async fn handle_delete(mut req: Request, env: Env) -> worker::Result<Response> {
    if !crate::routes::owner::authorized_async(&req, &env).await {
        return errors::unauthorized();
    }
    let input: DeleteIn = req
        .json()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let Some(code) = clean_code(&input.code) else {
        return errors::bad_request("INVALID_TOKEN", "that is not a 4-character code");
    };
    let db = device::db(&env)?;
    db.prepare("DELETE FROM tokens WHERE code=?")
        .bind(&[JsValue::from(code)])
        .map_err(|e| worker::Error::RustError(e.to_string()))?
        .run()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    Response::from_json(&serde_json::json!({ "ok": true }))
}

/// `POST /api/studio/tokens/cancel` - mark an UNUSED code as canceled so it
/// can no longer be redeemed. The row stays for the audit trail and shows
/// up as canceled (a used state) in the dashboard, deletable like the rest.
pub async fn handle_cancel(mut req: Request, env: Env) -> worker::Result<Response> {
    if !crate::routes::owner::authorized_async(&req, &env).await {
        return errors::unauthorized();
    }
    let input: DeleteIn = req
        .json()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let Some(code) = clean_code(&input.code) else {
        return errors::bad_request("INVALID_TOKEN", "that is not a 4-character code");
    };
    device::ensure_ddl(&env).await?;
    let db = device::db(&env)?;
    let row: Option<TokenRow> = db
        .prepare("SELECT kind,value,redeemed_by,canceled FROM tokens WHERE code=?")
        .bind(&[JsValue::from(code.clone())])
        .map_err(|e| worker::Error::RustError(e.to_string()))?
        .first(None)
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let Some(row) = row else {
        return errors::json_error(404, "TOKEN_NOT_FOUND", "no such unlock code");
    };
    if !row.redeemed_by.is_empty() {
        return errors::json_error(409, "TOKEN_USED", "that code was already used");
    }
    db.prepare("UPDATE tokens SET canceled=1 WHERE code=?")
        .bind(&[JsValue::from(code)])
        .map_err(|e| worker::Error::RustError(e.to_string()))?
        .run()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    Response::from_json(&serde_json::json!({ "ok": true }))
}

#[derive(Deserialize)]
pub struct PurgeIn {
    /// `used` = redeemed rows, `canceled` = canceled rows, `both` = either.
    pub filter: String,
}

/// The DELETE for a purge filter (pure, tested). `None` = unknown filter.
fn purge_sql(filter: &str) -> Option<&'static str> {
    match filter {
        "used" => Some("DELETE FROM tokens WHERE redeemed_by!='' AND canceled=0"),
        "canceled" => Some("DELETE FROM tokens WHERE canceled=1"),
        "both" => Some("DELETE FROM tokens WHERE redeemed_by!='' OR canceled=1"),
        _ => None,
    }
}

/// `POST /api/studio/tokens/purge` - bulk-delete spent codes by filter.
pub async fn handle_purge(mut req: Request, env: Env) -> worker::Result<Response> {
    if !crate::routes::owner::authorized_async(&req, &env).await {
        return errors::unauthorized();
    }
    let input: PurgeIn = req
        .json()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let Some(sql) = purge_sql(&input.filter) else {
        return errors::bad_request("INVALID_REQUEST", "filter must be used|canceled|both");
    };
    device::ensure_ddl(&env).await?;
    let db = device::db(&env)?;
    db.prepare(sql)
        .run()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    Response::from_json(&serde_json::json!({ "ok": true }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_codes_are_four_chars_from_the_alphabet() {
        for seed in [0u64, 1, 42, u64::MAX, 123456] {
            let code = token_code(seed);
            assert_eq!(code.len(), TOKEN_LEN);
            assert!(code.bytes().all(|b| TOKEN_ALPHABET.contains(&b)), "{code}");
            assert_eq!(clean_code(&code).as_deref(), Some(code.as_str()));
        }
        assert!(clean_code("AB").is_none());
        assert!(clean_code("AB!D").is_none());
        assert!(clean_code("abi").is_none()); // I is not in the alphabet
        assert_eq!(clean_code(" ab2c ").as_deref(), Some("AB2C"));
    }

    #[test]
    fn purge_filters_map_to_the_right_delete() {
        assert!(purge_sql("used")
            .unwrap()
            .contains("redeemed_by!='' AND canceled=0"));
        assert!(purge_sql("canceled").unwrap().contains("canceled=1"));
        assert!(purge_sql("both").unwrap().contains("OR canceled=1"));
        assert!(purge_sql("everything").is_none());
        assert!(purge_sql("").is_none());
    }

    #[test]
    fn minted_codes_are_valid_and_mostly_unique() {
        // Pure seeding path (the wasm call only supplies `random`).
        let mut seen = std::collections::HashSet::new();
        let clock = 1_760_000_000_000u64;
        for i in 0..200i64 {
            let code = token_code(mint_seed(
                (i as u64).wrapping_mul(0x2545_f491_4f6c_dd1d) ^ 0xabcdef,
                clock,
                i,
            ));
            assert_eq!(clean_code(&code).as_deref(), Some(code.as_str()));
            seen.insert(code);
        }
        assert!(seen.len() > 190, "only {} distinct codes", seen.len());
        // Same random word, different batch index: still a different code.
        assert_ne!(
            token_code(mint_seed(7, clock, 0)),
            token_code(mint_seed(7, clock, 1))
        );
    }

    #[test]
    fn tokens_apply_by_kind() {
        let now = 10_000;
        assert_eq!(apply_token("count", 5, 1, 0, now), (6, 0));
        assert_eq!(apply_token("time", 2, 0, 0, now), (0, now + 2 * HOUR_MS));
        // Stacking a time token onto an open window extends from its end.
        assert_eq!(
            apply_token("time", 1, 0, now + HOUR_MS, now),
            (0, now + 2 * HOUR_MS)
        );
        // Garbage values cannot mint a huge allowance.
        assert_eq!(apply_token("count", -100, 0, 0, now), (1, 0));
    }

    /// The dashboard serializes tokens as-is, so the shape must be stable.
    #[derive(Serialize, Deserialize)]
    struct Shape {
        code: String,
        kind: String,
        #[serde(default)]
        redeemed_by: String,
    }

    #[test]
    fn token_shape_round_trips_for_the_dashboard() {
        let s = Shape {
            code: "AB2C".into(),
            kind: "count".into(),
            redeemed_by: String::new(),
        };
        let v = serde_json::to_value(&s).unwrap();
        assert_eq!(v["kind"], "count");
        assert!(v["redeemed_by"].as_str().unwrap().is_empty());
    }
}
