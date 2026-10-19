/* credits.rs - Phase G: the shop-facing "buy more tokens" request loop
(manual billing gate: a shop asks, an admin approves, the credits land
in the same `credits` ledger the Genlook proxy meters against).
Shop endpoints authenticate with the shop's PLATFORM_TOKEN; admin
endpoints are ADMIN_TOKEN-guarded. A request is decided exactly once —
the state check runs before the write, so a double approve cannot grant
twice. */
use serde::{Deserialize, Serialize};
use worker::d1::D1Database;
use worker::{Env, Request, Response, Result};

use crate::{admin, auth, http, shops, store};

/// Upper bound for one manual request (sanity, not a price).
pub const MAX_REQUEST: i64 = 10_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditRequest {
    pub id: String,
    pub shop_id: String,
    pub requested: i64,
    pub reason: String,
    pub status: String,
    pub decided_by: Option<String>,
    pub created_ms: i64,
}

#[derive(Deserialize)]
struct RequestIn {
    requested: i64,
    #[serde(default)]
    reason: String,
}

#[derive(Deserialize)]
struct DecisionIn {
    id: String,
    #[serde(default)]
    reason: String,
}

const COLS: &str = "id,shop_id,requested,reason,status,decided_by,created_ms";

/// Pure: request amount window (tested).
pub fn valid_request(n: i64) -> bool {
    (1..=MAX_REQUEST).contains(&n)
}

/// Pure: only a pending request may be decided (tested).
pub fn decidable(status: &str) -> bool {
    status == "pending"
}

pub async fn pending(db: &D1Database) -> Result<Vec<CreditRequest>> {
    db.prepare(&format!(
        "SELECT {COLS} FROM credit_requests WHERE status = 'pending' ORDER BY created_ms DESC LIMIT 200"
    ))
    .all()
    .await?
    .results()
}

pub async fn by_id(db: &D1Database, id: &str) -> Result<Option<CreditRequest>> {
    db.prepare(&format!("SELECT {COLS} FROM credit_requests WHERE id = ?"))
        .bind(&store::str_args([id]))?
        .first::<CreditRequest>(None)
        .await
}

async fn insert_request(
    db: &D1Database,
    shop_id: &str,
    requested: i64,
    reason: &str,
    now_ms: i64,
) -> Result<CreditRequest> {
    let row = CreditRequest {
        id: store::new_id("cr"),
        shop_id: shop_id.to_string(),
        requested,
        reason: reason.to_string(),
        status: "pending".into(),
        decided_by: None,
        created_ms: now_ms,
    };
    store::write(
        db,
        "INSERT INTO credit_requests (id,shop_id,requested,reason,status,created_ms) VALUES (?,?,?,?,'pending',?)",
        vec![
            row.id.clone().into(),
            shop_id.into(),
            wasm_bindgen::JsValue::from(requested as f64),
            reason.into(),
            wasm_bindgen::JsValue::from(now_ms as f64),
        ],
    )
    .await?;
    Ok(row)
}

async fn decide(db: &D1Database, id: &str, status: &str, by: &str) -> Result<()> {
    store::write(
        db,
        "UPDATE credit_requests SET status = ?, decided_by = ? WHERE id = ? AND status = 'pending'",
        vec![status.into(), by.into(), id.into()],
    )
    .await
}

/// `POST /api/v1/shop/credits/request {requested, reason?}` — shop auth.
pub async fn handle_shop_request(env: Env, req: &mut Request) -> Result<Response> {
    let Some(token) = auth::bearer(req.headers()) else {
        return http::unauthorized();
    };
    let db = store::db(&env)?;
    let Some(shop) = shops::shop_by_token(&db, &token).await? else {
        return http::unauthorized();
    };
    let Some(body) = http::json_body::<RequestIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {requested, reason?}");
    };
    if !valid_request(body.requested) {
        return http::bad_request("BAD_AMOUNT", "request between 1 and 10000 tokens");
    }
    let now = auth::now_ms();
    let row = insert_request(&db, &shop.id, body.requested, body.reason.trim(), now).await?;
    store::append_audit(&db, &shop.id, "credits.request", &row.id, "", now).await?;
    Response::from_json(&serde_json::json!({ "ok": true, "request": row }))
}

/// `GET /api/v1/admin/credits` — pending requests.
pub async fn handle_admin_list(env: Env, req: &Request) -> Result<Response> {
    if !admin::is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let db = store::db(&env)?;
    let rows = pending(&db).await?;
    Response::from_json(&serde_json::json!({ "requests": rows }))
}

/// `POST /api/v1/admin/credits/approve {id}` — grant + close in one step.
pub async fn handle_admin_approve(env: Env, req: &mut Request) -> Result<Response> {
    if !admin::is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let Some(body) = http::json_body::<DecisionIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {id}");
    };
    let db = store::db(&env)?;
    let Some(row) = by_id(&db, body.id.trim()).await? else {
        return http::not_found("unknown credit request");
    };
    if !decidable(&row.status) {
        return http::json_error(409, "ALREADY_DECIDED", "this request was already decided");
    }
    let now = auth::now_ms();
    shops::grant_credits(&db, &row.shop_id, row.requested, now).await?;
    decide(&db, &row.id, "approved", "admin").await?;
    store::append_audit(&db, &row.shop_id, "credits.approve", &row.id, "", now).await?;
    Response::from_json(&serde_json::json!({
        "ok": true,
        "granted": row.requested,
        "shop_id": row.shop_id,
    }))
}

/// `POST /api/v1/admin/credits/reject {id, reason?}`.
pub async fn handle_admin_reject(env: Env, req: &mut Request) -> Result<Response> {
    if !admin::is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let Some(body) = http::json_body::<DecisionIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {id, reason?}");
    };
    let db = store::db(&env)?;
    let Some(row) = by_id(&db, body.id.trim()).await? else {
        return http::not_found("unknown credit request");
    };
    if !decidable(&row.status) {
        return http::json_error(409, "ALREADY_DECIDED", "this request was already decided");
    }
    let now = auth::now_ms();
    let by = if body.reason.trim().is_empty() {
        "admin".to_string()
    } else {
        format!("admin: {}", body.reason.trim())
    };
    decide(&db, &row.id, "rejected", &by).await?;
    store::append_audit(&db, &row.shop_id, "credits.reject", &row.id, "", now).await?;
    Response::from_json(&serde_json::json!({ "ok": true }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_amounts_are_bounded() {
        assert!(valid_request(1));
        assert!(valid_request(MAX_REQUEST));
        assert!(!valid_request(0));
        assert!(!valid_request(-5));
        assert!(!valid_request(MAX_REQUEST + 1));
    }

    #[test]
    fn only_pending_requests_can_be_decided() {
        assert!(decidable("pending"));
        assert!(!decidable("approved"));
        assert!(!decidable("rejected"));
    }
}
