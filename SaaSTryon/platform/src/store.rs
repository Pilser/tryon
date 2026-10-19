/* store.rs - the platform D1: migration 0001 (users, sessions, shops,
hostnames, credits, credit_requests, audit) plus the queries Phase B
needs. D1 quirk: `result.meta()` carries `Option<usize>` counters — they
are never trusted for logic; success is the absence of an Err. */
use serde::{Deserialize, Serialize};
use wasm_bindgen::JsValue;
use worker::d1::D1Database;
use worker::{Error, Result};

use crate::auth::{random_hex, Session};

/// The migrations applied by [`ensure_schema`], in order.
pub const MIGRATIONS: [&str; 2] = [
    include_str!("../migrations/0001_init.sql"),
    include_str!("../migrations/0002_shop_tokens.sql"),
];

/// Kept for callers that referenced the first migration directly.
pub const INIT_SQL: &str = MIGRATIONS[0];

/// Bind for this worker (`[[d1_databases]]` in wrangler.toml).
pub const DB_BINDING: &str = "PLATFORM_DB";

pub fn db(env: &worker::Env) -> Result<D1Database> {
    env.d1(DB_BINDING)
        .map_err(|_| Error::RustError("D1 PLATFORM_DB not configured".into()))
}

/// Applies `migrations/0001_init.sql` (every statement is `CREATE TABLE IF
/// NOT EXISTS`; the file is split on ";\n" and exec'd per statement). Cheap
/// to call on cold start; idempotent on every call.
pub async fn ensure_schema(env: &worker::Env) -> Result<()> {
    let db = db(env)?;
    for (rev, sql) in MIGRATIONS.iter().enumerate() {
        for stmt in sql.split(";\n") {
            let stmt = stmt.trim();
            if stmt.is_empty() {
                continue;
            }
            db.exec(stmt).await.map_err(|e| {
                let shown: String = stmt.chars().take(64).collect();
                Error::RustError(format!(
                    "schema migration {:04} failed at {shown:?}: {e}",
                    rev + 1
                ))
            })?;
        }
    }
    Ok(())
}

pub fn new_id(prefix: &str) -> String {
    format!("{prefix}_{}", random_hex(8))
}

// ---------------------------------------------------------------- rows

#[derive(Deserialize)]
pub struct UserRow {
    pub id: String,
    pub email: String,
    #[serde(default)]
    pub contact: String,
    #[serde(default)]
    pub shop_name: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub deploy_allowance: i64,
    #[serde(default)]
    pub deploy_used: i64,
    #[serde(default)]
    pub auth_hash: Option<String>,
    #[serde(default)]
    pub created_ms: i64,
    #[serde(default)]
    pub approved_by: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
}

/// JSON projection of a user — `auth_hash` never crosses the API.
#[derive(Serialize)]
pub struct UserView {
    pub id: String,
    pub email: String,
    pub contact: String,
    pub shop_name: String,
    pub status: String,
    pub deploy_allowance: i64,
    pub deploy_used: i64,
    pub created_ms: i64,
    pub approved_by: Option<String>,
}

impl From<&UserRow> for UserView {
    fn from(u: &UserRow) -> Self {
        UserView {
            id: u.id.clone(),
            email: u.email.clone(),
            contact: u.contact.clone(),
            shop_name: u.shop_name.clone(),
            status: u.status.clone(),
            deploy_allowance: u.deploy_allowance,
            deploy_used: u.deploy_used,
            created_ms: u.created_ms,
            approved_by: u.approved_by.clone(),
        }
    }
}

const USER_SELECT_ALL: &str =
    "SELECT id,email,contact,shop_name,status,deploy_allowance,deploy_used,created_ms,approved_by,note FROM users";

// ------------------------------------------------------------- users

// ------------------------------------------------------------- users

pub async fn user_by_email(db: &D1Database, email: &str) -> Result<Option<UserRow>> {
    one_user(db, &format!("{USER_SELECT_ALL} WHERE email = ?"), [email]).await
}

pub async fn user_by_id(db: &D1Database, id: &str) -> Result<Option<UserRow>> {
    one_user(db, &format!("{USER_SELECT_ALL} WHERE id = ?"), [id]).await
}

pub async fn user_by_auth_hash(db: &D1Database, hash: &str) -> Result<Option<UserRow>> {
    one_user(
        db,
        &format!("{USER_SELECT_ALL} WHERE auth_hash = ?"),
        [hash],
    )
    .await
}

async fn one_user<const N: usize>(
    db: &D1Database,
    sql: &str,
    binds: [&str; N],
) -> Result<Option<UserRow>> {
    db.prepare(sql)
        .bind(&str_args(binds))?
        .first::<UserRow>(None)
        .await
}

/// List users, optionally by status (`pending`/`approved`/`suspended`/
/// `rejected`); `None` = everything, newest first.
pub async fn list_users(db: &D1Database, status: Option<&str>) -> Result<Vec<UserRow>> {
    let (sql, binds) = match status {
        Some(s) => (
            format!("{USER_SELECT_ALL} WHERE status = ? ORDER BY created_ms DESC LIMIT 200"),
            str_args([s]),
        ),
        None => (
            format!("{USER_SELECT_ALL} ORDER BY created_ms DESC LIMIT 200"),
            Vec::new(),
        ),
    };
    db.prepare(sql).bind(&binds)?.all().await?.results()
}

/// Signup insert — status always starts at `pending` (§7.6).
pub async fn insert_user(
    db: &D1Database,
    id: &str,
    email: &str,
    contact: &str,
    shop_name: &str,
    created_ms: i64,
) -> Result<()> {
    write(
        db,
        "INSERT INTO users (id,email,contact,shop_name,status,deploy_allowance,deploy_used,created_ms) VALUES (?,?,?,?,'pending',0,0,?)",
        vec![
            id.into(),
            email.into(),
            contact.into(),
            shop_name.into(),
            JsValue::from(created_ms as f64),
        ],
    )
    .await
}

pub async fn set_status(
    db: &D1Database,
    id: &str,
    status: &str,
    approved_by: Option<&str>,
) -> Result<()> {
    write(
        db,
        "UPDATE users SET status = ?, approved_by = ? WHERE id = ?",
        vec![
            status.into(),
            approved_by.map(|s| s.into()).unwrap_or(JsValue::NULL),
            id.into(),
        ],
    )
    .await
}

pub async fn set_allowance(db: &D1Database, id: &str, deploy_allowance: i64) -> Result<()> {
    write(
        db,
        "UPDATE users SET deploy_allowance = ? WHERE id = ?",
        vec![JsValue::from(deploy_allowance as f64), id.into()],
    )
    .await
}

/// Stores ONLY the sha256 hex of the one-shot `plat_` token (§7.6).
pub async fn set_auth(db: &D1Database, id: &str, auth_hash: &str, now_ms: i64) -> Result<()> {
    write(
        db,
        "UPDATE users SET auth_hash = ?, auth_created_ms = ? WHERE id = ?",
        vec![auth_hash.into(), JsValue::from(now_ms as f64), id.into()],
    )
    .await
}

pub async fn set_note(db: &D1Database, id: &str, note: &str) -> Result<()> {
    write(
        db,
        "UPDATE users SET note = ? WHERE id = ?",
        vec![note.into(), id.into()],
    )
    .await
}

// ----------------------------------------------------------- sessions

pub async fn insert_session(db: &D1Database, s: &Session) -> Result<()> {
    write(
        db,
        "INSERT INTO sessions (id,user_id,created_ms,expires_ms) VALUES (?,?,?,?)",
        vec![
            s.id.clone().into(),
            s.user_id.clone().into(),
            JsValue::from(s.created_ms as f64),
            JsValue::from(s.expires_ms as f64),
        ],
    )
    .await
}

pub async fn session_by_id(db: &D1Database, id: &str) -> Result<Option<Session>> {
    db.prepare("SELECT id,user_id,created_ms,expires_ms FROM sessions WHERE id = ?")
        .bind(&str_args([id]))?
        .first::<Session>(None)
        .await
}

pub async fn delete_session(db: &D1Database, id: &str) -> Result<()> {
    write(db, "DELETE FROM sessions WHERE id = ?", vec![id.into()]).await
}

// ------------------------------------------------------------- audit

/// Admin-action audit trail (§7.2). `meta` is a JSON payload string.
pub async fn append_audit(
    db: &D1Database,
    actor: &str,
    action: &str,
    subject: &str,
    meta: &str,
    now_ms: i64,
) -> Result<()> {
    write(
        db,
        "INSERT INTO audit (id,actor,action,subject,meta,created_ms) VALUES (?,?,?,?,?,?)",
        vec![
            new_id("aud").into(),
            actor.into(),
            action.into(),
            subject.into(),
            meta.into(),
            JsValue::from(now_ms as f64),
        ],
    )
    .await
}

// ----------------------------------------------------------- helpers

/// Text columns bind as JS strings; timestamps bind as numbers above.
fn str_args<const N: usize>(vals: [&str; N]) -> Vec<JsValue> {
    vals.iter().map(|v| v.to_string().into()).collect()
}

async fn write(db: &D1Database, sql: &str, binds: Vec<JsValue>) -> Result<()> {
    // Success = no Err; D1 meta counters are never trusted for logic.
    let _ = db.prepare(sql).bind(&binds)?.run().await?;
    Ok(())
}

// ------------------------------------------------------ shop tokens (E)

/// A 4-digit code the admin prints and a shop redeems to top up credits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopToken {
    pub code: String,
    pub shop_id: Option<String>,
    pub status: String, // active | used | cancelled
    pub created_ms: i64,
    pub redeemed_ms: Option<i64>,
    pub redeemed_by: Option<String>,
    pub cancelled_ms: Option<i64>,
    pub note: String,
}

/// Mints `count` unique 4-digit codes. Codes are drawn with rejection
/// sampling against existing rows so collisions (10 000 space) retry;
/// `existing` codes from this batch are also avoided via the DB PK.
pub async fn mint_shop_tokens(
    db: &D1Database,
    count: usize,
    note: &str,
    now_ms: i64,
) -> Result<Vec<ShopToken>> {
    let mut minted = Vec::with_capacity(count);
    for _ in 0..count {
        let code = loop {
            let c = format!(
                "{:04}",
                (random_hex(2).parse::<u16>().unwrap_or(0) % 10_000)
            );
            let exists: Option<ShopToken> = token_by_code(db, &c).await?;
            if exists.is_none() {
                break c;
            }
        };
        write(
            db,
            "INSERT INTO shop_tokens (code,shop_id,status,created_ms,note) VALUES (?,NULL,'active',?,?)",
            str_args([&code, &note]),
        )
        .await?;
        minted.push(ShopToken {
            code,
            shop_id: None,
            status: "active".into(),
            created_ms: now_ms,
            redeemed_ms: None,
            redeemed_by: None,
            cancelled_ms: None,
            note: note.into(),
        });
    }
    Ok(minted)
}

const TOKEN_SELECT_ALL: &str =
    "SELECT code,shop_id,status,created_ms,redeemed_ms,redeemed_by,cancelled_ms,note FROM shop_tokens";

pub async fn token_by_code(db: &D1Database, code: &str) -> Result<Option<ShopToken>> {
    db.prepare(&format!("{TOKEN_SELECT_ALL} WHERE code = ?"))
        .bind(&str_args([code]))?
        .first::<ShopToken>(None)
        .await
}

/// Lists tokens newest first, optionally filtered by status
/// (`active`/`used`/`cancelled`).
pub async fn list_shop_tokens(db: &D1Database, status: Option<&str>) -> Result<Vec<ShopToken>> {
    let (sql, binds) = match status {
        Some(s) => (
            format!("{TOKEN_SELECT_ALL} WHERE status = ? ORDER BY created_ms DESC LIMIT 500"),
            str_args([s]),
        ),
        None => (
            format!("{TOKEN_SELECT_ALL} ORDER BY created_ms DESC LIMIT 500"),
            Vec::new(),
        ),
    };
    db.prepare(sql).bind(&binds)?.all().await?.results()
}

/// Redeems a token: only `active` tokens succeed; the shop is stamped and
/// the row flips to `used`. Returns Err on missing/cancelled/used tokens.
pub async fn redeem_shop_token(
    db: &D1Database,
    code: &str,
    shop_id: &str,
    now_ms: i64,
) -> Result<ShopToken> {
    let Some(tok) = token_by_code(db, code).await? else {
        return Err(Error::RustError("no such token".into()));
    };
    if tok.status != "active" {
        return Err(Error::RustError(format!("token is {}", tok.status)));
    }
    write(
        db,
        "UPDATE shop_tokens SET shop_id = ?, status = 'used', redeemed_ms = ?, redeemed_by = ? WHERE code = ?",
        vec![
            shop_id.into(),
            JsValue::from(now_ms as f64),
            shop_id.into(),
            code.into(),
        ],
    )
    .await?;
    token_by_code(db, code)
        .await?
        .ok_or_else(|| Error::RustError("token vanished after redeem".into()))
}

/// Cancels an unused token (admin action, before a shop redeems it).
pub async fn cancel_shop_token(db: &D1Database, code: &str, now_ms: i64) -> Result<ShopToken> {
    let Some(tok) = token_by_code(db, code).await? else {
        return Err(Error::RustError("no such token".into()));
    };
    if tok.status != "active" {
        return Err(Error::RustError(format!("token is {}", tok.status)));
    }
    write(
        db,
        "UPDATE shop_tokens SET status = 'cancelled', cancelled_ms = ? WHERE code = ?",
        vec![JsValue::from(now_ms as f64), code.into()],
    )
    .await?;
    token_by_code(db, code)
        .await?
        .ok_or_else(|| Error::RustError("token vanished after cancel".into()))
}

// ------------------------------------------------------------- shops (E)

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

const SHOP_SELECT_ALL: &str =
    "SELECT id,owner_id,name,subdomain,cluster_id,status,tier,depot_version,created_ms FROM shops";

/// Finds a shop by its cluster token — the per-shop secret bound at deploy
/// time and used as the Bearer credential when the shop calls the platform.
pub async fn shop_by_token(db: &D1Database, token: &str) -> Result<Option<Shop>> {
    db.prepare(&format!("{SHOP_SELECT_ALL} WHERE cluster_id = ?"))
        .bind(&str_args([token]))?
        .first::<Shop>(None)
        .await
}

pub async fn shop_by_id(db: &D1Database, id: &str) -> Result<Option<Shop>> {
    db.prepare(&format!("{SHOP_SELECT_ALL} WHERE id = ?"))
        .bind(&str_args([id]))?
        .first::<Shop>(None)
        .await
}
