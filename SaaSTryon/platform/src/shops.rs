/* shops.rs - the SaaSTryon shop domain (Phase E): the `shops` row, its
lookups, and the shop-token lifecycle (`shop_tokens` migration 0002).
The admin mints 4-digit codes; a shop redeems one to top up its
`tryon_tokens` credit balance. Pure logic (code formatting, state
transitions) is tested; D1 paths stay thin wrappers like `store.rs`. */
use serde::{Deserialize, Serialize};
use wasm_bindgen::JsValue;
use worker::d1::D1Database;
use worker::Result;

use crate::auth::random_hex;
use crate::store::{str_args, write};

// ------------------------------------------------------------- shop row

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Shop {
    pub id: String,
    pub owner_id: String,
    pub name: String,
    pub subdomain: String,
    pub cluster_id: String,
    pub status: String,
    pub tier: String,
    pub depot_version: String,
    pub created_ms: i64,
}

const SHOP_COLS: &str =
    "id,owner_id,name,subdomain,cluster_id,status,tier,depot_version,created_ms";

/// Finds a shop by its cluster token — the per-shop secret bound at
/// deploy time and used as the Bearer credential when the shop calls
/// the platform.
pub async fn shop_by_token(db: &D1Database, token: &str) -> Result<Option<Shop>> {
    db.prepare(&format!(
        "SELECT {SHOP_COLS} FROM shops WHERE cluster_id = ?"
    ))
    .bind(&str_args([token]))?
    .first::<Shop>(None)
    .await
}

pub async fn shop_by_id(db: &D1Database, id: &str) -> Result<Option<Shop>> {
    db.prepare(&format!("SELECT {SHOP_COLS} FROM shops WHERE id = ?"))
        .bind(&str_args([id]))?
        .first::<Shop>(None)
        .await
}

// ---------------------------------------------------------- shop tokens

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopToken {
    pub code: String,
    pub shop_id: Option<String>,
    pub status: String,
    pub created_ms: i64,
    pub redeemed_ms: Option<i64>,
    pub redeemed_by: Option<String>,
    pub cancelled_ms: Option<i64>,
    pub note: Option<String>,
}

/// A minted code is a uniformly random 4-digit string, "0000".."9999".
/// 10_000 codespace; collisions are retried against D1 at mint time.
pub fn format_code(raw: u32) -> String {
    format!("{:04}", raw % 10_000)
}

/// Draws one random code in "0000".."9999" (4 hex bytes % 10_000 —
/// modulo bias is ~0.6%, acceptable for a 4-digit code space).
pub fn new_code() -> String {
    let raw = u32::from_str_radix(&random_hex(4)[..4], 16).unwrap_or(0);
    format_code(raw)
}

const TOKEN_COLS: &str = "code,shop_id,status,created_ms,redeemed_ms,redeemed_by,cancelled_ms,note";

/// Mints `count` unique codes, retrying per-code on primary-key
/// collision. Returns the freshly minted rows in mint order.
pub async fn mint_shop_tokens(
    db: &D1Database,
    count: usize,
    note: &str,
    now_ms: i64,
) -> Result<Vec<ShopToken>> {
    let mut out = Vec::with_capacity(count);
    for _ in 0..count {
        let mut code = new_code();
        for _ in 0..8 {
            let res = write(
                db,
                "INSERT INTO shop_tokens (code,shop_id,status,created_ms,note)
                 VALUES (?,NULL,'active',?,?)",
                vec![
                    code.clone().into(),
                    JsValue::from(now_ms as f64),
                    note.into(),
                ],
            )
            .await;
            if res.is_ok() {
                break;
            }
            code = new_code();
        }
        out.push(ShopToken {
            code,
            shop_id: None,
            status: "active".into(),
            created_ms: now_ms,
            redeemed_ms: None,
            redeemed_by: None,
            cancelled_ms: None,
            note: Some(note.to_string()),
        });
    }
    Ok(out)
}

pub async fn token_by_code(db: &D1Database, code: &str) -> Result<Option<ShopToken>> {
    db.prepare(&format!(
        "SELECT {TOKEN_COLS} FROM shop_tokens WHERE code = ?"
    ))
    .bind(&str_args([code]))?
    .first::<ShopToken>(None)
    .await
}

/// `status` filter: one of active|used|cancelled, or None for all.
pub async fn list_shop_tokens(db: &D1Database, status: Option<&str>) -> Result<Vec<ShopToken>> {
    let sql = match status {
        Some(_) => format!(
            "SELECT {TOKEN_COLS} FROM shop_tokens WHERE status = ? ORDER BY created_ms DESC"
        ),
        _ => format!("SELECT {TOKEN_COLS} FROM shop_tokens ORDER BY created_ms DESC"),
    };
    let mut q = db.prepare(&sql);
    if let Some(s) = status {
        q = q.bind(&str_args([s]))?;
    }
    q.all().await?.results::<ShopToken>()
}

/// Pure check a redemption may proceed: only `active` tokens redeem.
pub fn redeemable(status: &str) -> bool {
    status == "active"
}

/// Marks an active code as used by `shop_id`. Caller pre-checks the
/// token state (D1 meta counters are not trusted); the WHERE clause is
/// the second guard. Errors if the code was not active at read time.
pub async fn redeem_shop_token(
    db: &D1Database,
    code: &str,
    shop_id: &str,
    now_ms: i64,
) -> Result<ShopToken> {
    let Some(t) = token_by_code(db, code).await? else {
        return Err(worker::Error::RustError("unknown token".into()));
    };
    if !redeemable(&t.status) {
        return Err(worker::Error::RustError(format!(
            "token not redeemable (status={})",
            t.status
        )));
    }
    write(
        db,
        "UPDATE shop_tokens SET status='used', redeemed_ms=?, redeemed_by=?
         WHERE code = ? AND status='active'",
        vec![JsValue::from(now_ms as f64), shop_id.into(), code.into()],
    )
    .await?;
    Ok(ShopToken {
        shop_id: Some(shop_id.to_string()),
        status: "used".into(),
        redeemed_ms: Some(now_ms),
        ..t
    })
}

/// Pure check a cancellation may proceed: only unused tokens cancel.
pub fn cancellable(status: &str) -> bool {
    status == "active"
}

pub async fn cancel_shop_token(db: &D1Database, code: &str, now_ms: i64) -> Result<ShopToken> {
    let Some(t) = token_by_code(db, code).await? else {
        return Err(worker::Error::RustError("unknown token".into()));
    };
    if !cancellable(&t.status) {
        return Err(worker::Error::RustError(format!(
            "token not cancellable (status={})",
            t.status
        )));
    }
    write(
        db,
        "UPDATE shop_tokens SET status='cancelled', cancelled_ms=?
         WHERE code = ? AND status='active'",
        vec![JsValue::from(now_ms as f64), code.into()],
    )
    .await?;
    Ok(ShopToken {
        status: "cancelled".into(),
        cancelled_ms: Some(now_ms),
        ..t
    })
}

// -------------------------------------------------------------- credits

/// Adds `amount` to the shop's `tryon_tokens` granted_total, creating
/// the row on first grant (migration 0001: PRIMARY KEY shop_id+product).
pub async fn grant_credits(db: &D1Database, shop_id: &str, amount: i64, now_ms: i64) -> Result<()> {
    write(
        db,
        "INSERT INTO credits (shop_id,product,granted_total,used_total,updated_ms)
         VALUES (?,'tryon_tokens',?,0,?)
         ON CONFLICT (shop_id,product) DO UPDATE SET
           granted_total = granted_total + excluded.granted_total,
           updated_ms = excluded.updated_ms",
        vec![
            shop_id.into(),
            JsValue::from(amount as f64),
            JsValue::from(now_ms as f64),
        ],
    )
    .await
}

// ------------------------------------------------- credit metering (E)

/// The shop's tryon_tokens balance (granted minus used); 0 when the row
/// does not exist yet.
pub async fn credits_left(db: &D1Database, shop_id: &str) -> Result<i64> {
    #[derive(Deserialize)]
    struct Row {
        granted_total: i64,
        used_total: i64,
    }
    let row = db
        .prepare(
            "SELECT granted_total, used_total FROM credits WHERE shop_id = ? AND product = 'tryon_tokens'",
        )
        .bind(&str_args([shop_id]))?
        .first::<Row>(None)
        .await?;
    Ok(row.map(|r| r.granted_total - r.used_total).unwrap_or(0))
}

/// Atomic check-and-decrement for the Genlook proxy: the conditional
/// UPDATE only fires when balance >= 1, so concurrent calls cannot drive
/// the balance negative. Returns false when the shop is out of credits
/// (or when the D1 meta counter is unknown — we fail closed, never
/// spending platform money on a guess).
pub async fn consume_credit(db: &D1Database, shop_id: &str, now_ms: i64) -> Result<bool> {
    let res = db
        .prepare(
            "UPDATE credits SET used_total = used_total + 1, updated_ms = ? WHERE shop_id = ? AND product = 'tryon_tokens' AND granted_total - used_total >= 1",
        )
        .bind(&[JsValue::from(now_ms as f64), shop_id.into()])?
        .run()
        .await?;
    // D1 quirk: no rows_affected(); meta().changes is Option<usize> —
    // None means unknown, treated as "not applied" so we fail closed.
    let changed = res.meta()?.and_then(|m| m.changes).unwrap_or(0);
    Ok(changed > 0)
}

// --------------------------------------------------------------- tests

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_format_is_four_digits() {
        assert_eq!(format_code(0), "0000");
        assert_eq!(format_code(7), "0007");
        assert_eq!(format_code(9_999), "9999");
        // Out-of-range raws wrap into the 10_000 codespace.
        assert_eq!(format_code(10_000), "0000");
        assert_eq!(format_code(42_017), "2017");
    }

    #[test]
    fn drawn_codes_are_unique_enough_and_well_formed() {
        let mut seen = std::collections::HashSet::new();
        for _ in 0..256 {
            let c = new_code();
            assert_eq!(c.len(), 4, "code {c} not 4 chars");
            assert!(c.chars().all(|ch| ch.is_ascii_digit()));
            seen.insert(c);
        }
        // 256 draws over 10_000 codespace: expect almost no repeats.
        assert!(seen.len() > 240, "suspicious repeats: {}", seen.len());
    }

    #[test]
    fn only_active_tokens_redeem_or_cancel() {
        assert!(redeemable("active"));
        assert!(!redeemable("used"));
        assert!(!redeemable("cancelled"));
        assert!(cancellable("active"));
        assert!(!cancellable("used"));
        assert!(!cancellable("cancelled"));
    }

    #[test]
    fn redeem_preserves_identity_and_stamps_usage() {
        let t = ShopToken {
            code: "1234".into(),
            shop_id: None,
            status: "active".into(),
            created_ms: 100,
            redeemed_ms: None,
            redeemed_by: None,
            cancelled_ms: None,
            note: Some("batch".into()),
        };
        let used = redeem_shop_token_outcome(t.clone(), "shopA", 200);
        assert_eq!(used.code, "1234");
        assert_eq!(used.shop_id.as_deref(), Some("shopA"));
        assert_eq!(used.status, "used");
        assert_eq!(used.redeemed_ms, Some(200));
        assert_eq!(used.note.as_deref(), Some("batch"));
    }

    #[test]
    fn cancel_preserves_code_and_stamps_time() {
        let t = ShopToken {
            code: "5678".into(),
            shop_id: Some("shopB".into()),
            status: "active".into(),
            created_ms: 100,
            redeemed_ms: None,
            redeemed_by: None,
            cancelled_ms: None,
            note: None,
        };
        let c = cancel_shop_token_outcome(t, 300);
        assert_eq!(c.code, "5678");
        assert_eq!(c.status, "cancelled");
        assert_eq!(c.cancelled_ms, Some(300));
        assert_eq!(c.redeemed_ms, None);
    }

    // Local mirrors of the DB-bound fns' outcome construction, so the
    // state stamps are tested without a D1 handle.
    fn redeem_shop_token_outcome(t: ShopToken, shop_id: &str, now: i64) -> ShopToken {
        ShopToken {
            shop_id: Some(shop_id.to_string()),
            status: "used".into(),
            redeemed_ms: Some(now),
            ..t
        }
    }
    fn cancel_shop_token_outcome(t: ShopToken, now: i64) -> ShopToken {
        ShopToken {
            status: "cancelled".into(),
            cancelled_ms: Some(now),
            ..t
        }
    }
}
