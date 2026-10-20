/* store.rs - the platform D1: migration 0001 (users, sessions, shops,
hostnames, credits, credit_requests, audit) plus the queries Phase B
needs. D1 quirk: `result.meta()` carries `Option<usize>` counters — they
are never trusted for logic; success is the absence of an Err. */
use serde::{Deserialize, Serialize};
use wasm_bindgen::JsValue;
use worker::d1::D1Database;
use worker::{Error, Result};

use crate::auth::{random_hex, Session};
pub use crate::shops::{
    cancel_shop_token, grant_credits, list_shop_tokens, mint_shop_tokens, redeem_shop_token,
    shop_by_id, shop_by_token, token_by_code, Shop, ShopToken,
};

/// The migrations applied by [`ensure_schema`], in order.
pub const MIGRATIONS: [&str; 3] = [
    include_str!("../migrations/0001_init.sql"),
    include_str!("../migrations/0002_shop_tokens.sql"),
    include_str!("../migrations/0003_shop_token.sql"),
];

/// Kept for callers that referenced the first migration directly.
pub const INIT_SQL: &str = MIGRATIONS[0];

/// Splits a migration file into statements. Comment lines are dropped
/// first: a `--` line may mention the `";\n"` marker itself, and
/// splitting on that would leave a comment as a statement (SQLite
/// rejects a lone comment with "incomplete input").
pub fn split_statements(sql: &str) -> Vec<String> {
    let body: String = sql
        .lines()
        .filter(|l| !l.trim_start().starts_with("--"))
        .collect::<Vec<_>>()
        .join("\n");
    // No trailing semicolon: D1's exec() splits the batch on ";" and a
    // trailing ";" would leave it an empty statement ("incomplete input").
    body.split(";\n")
        .map(|s| s.trim().trim_end_matches(';').trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

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
        for stmt in split_statements(sql) {
            let stmt = stmt.trim();
            if stmt.is_empty() {
                continue;
            }
            // One prepared statement per call: D1's exec() re-splits the
            // batch on ";" and then chokes on the pieces it cannot parse
            // (a trailing ";" becomes an empty statement).
            if let Err(e) = db.prepare(stmt).run().await {
                // "duplicate column name" = an ALTER that already ran on
                // an earlier cold start. SQLite has no ADD COLUMN IF NOT
                // EXISTS, so this is the idempotency guard.
                let msg = e.to_string();
                if !msg.contains("duplicate column name") {
                    let shown: String = stmt.chars().take(64).collect();
                    return Err(Error::RustError(format!(
                        "schema migration {:04} failed at {shown:?}: {e}",
                        rev + 1
                    )));
                }
            }
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
pub(crate) fn str_args<const N: usize>(vals: [&str; N]) -> Vec<JsValue> {
    vals.iter().map(|v| v.to_string().into()).collect()
}

pub(crate) async fn write(db: &D1Database, sql: &str, binds: Vec<JsValue>) -> Result<()> {
    // Success = no Err; D1 meta counters are never trusted for logic.
    let _ = db.prepare(sql).bind(&binds)?.run().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::split_statements;

    #[test]
    fn migration_split_ignores_comment_lines() {
        // A comment may mention the marker itself - the split must not
        // turn the comment into a statement.
        let sql = "-- header with the \";\\n\" marker inside\nCREATE TABLE a (x TEXT);\n-- trailing note\nCREATE TABLE b (y TEXT);\n";
        let stmts = split_statements(sql);
        assert_eq!(stmts.len(), 2, "two statements, no comment");
        assert!(stmts[0].starts_with("CREATE TABLE a"));
        assert!(stmts[1].starts_with("CREATE TABLE b"));
        assert!(stmts.iter().all(|s| !s.ends_with(';')));
    }

    #[test]
    fn the_real_migrations_split_into_complete_statements() {
        // The migration files are the input, so this is the guard that
        // the shipped schema actually parses.
        for (i, sql) in super::MIGRATIONS.iter().enumerate() {
            let stmts = split_statements(sql);
            assert!(!stmts.is_empty(), "migration {i} produced no statements");
            for st in &stmts {
                assert!(
                    st.contains('(') && !st.ends_with(';'),
                    "migration {i}: statement looks cut: {st}"
                );
                assert!(!st.starts_with("--"), "migration {i}: comment leaked");
                assert!(
                    st.matches('(').count() == st.matches(')').count(),
                    "migration {i}: unbalanced parens: {st}"
                );
            }
        }
    }

    #[test]
    fn empty_and_blank_input_yields_nothing() {
        assert!(split_statements("").is_empty());
        assert!(split_statements("   \n\n").is_empty());
        assert!(split_statements("-- only a comment\n").is_empty());
    }
}
