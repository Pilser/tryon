/* admin.rs - admin endpoints guarded by ADMIN_TOKEN (plain Bearer compare
against the secret, like the shop's OWNER_TOKEN; fail-closed when unset)
and the user-status state machine:

  pending --approve--> approved --suspend--> suspended --reactivate--> approved
  pending --reject--> rejected (terminal; no further transitions)

Every mutating admin action appends an `audit` row. */
use serde::Deserialize;
use serde_json::json;
use worker::{Env, Headers, Request, Response, Result};

use crate::{auth, http, store};

/// Deploy allowances are small integers; guard against negatives.
pub const MAX_ALLOWANCE: i64 = 500;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum UserStatus {
    Pending,
    Approved,
    Suspended,
    Rejected,
}

impl UserStatus {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "pending" => Some(UserStatus::Pending),
            "approved" => Some(UserStatus::Approved),
            "suspended" => Some(UserStatus::Suspended),
            "rejected" => Some(UserStatus::Rejected),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            UserStatus::Pending => "pending",
            UserStatus::Approved => "approved",
            UserStatus::Suspended => "suspended",
            UserStatus::Rejected => "rejected",
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AdminAction {
    Approve,
    Reject,
    Suspend,
    Reactivate,
}

/// The transition rules as a pure function (tested, no D1 needed).
/// `None` = illegal: rejected is terminal, approve only from pending,
/// suspend only from approved, reactivate only from suspended.
pub fn transition(from: UserStatus, action: AdminAction) -> Option<UserStatus> {
    use AdminAction as A;
    use UserStatus as S;
    match (from, action) {
        (S::Pending, A::Approve) => Some(S::Approved),
        (S::Pending, A::Reject) => Some(S::Rejected),
        (S::Approved, A::Suspend) => Some(S::Suspended),
        (S::Suspended, A::Reactivate) => Some(S::Approved),
        _ => None,
    }
}

/// ADMIN_TOKEN gate: plaintext Bearer compare against the env secret.
/// Unset/empty ADMIN_TOKEN denies everything (fail-closed: the admin
/// surface never opens just because a secret is missing).
pub fn is_admin(headers: &Headers, env: &Env) -> bool {
    let expected = env
        .var("ADMIN_TOKEN")
        .map(|v| v.to_string())
        .unwrap_or_default();
    !expected.is_empty() && auth::bearer(headers) == Some(expected)
}

fn valid_allowance(v: i64) -> bool {
    (0..=MAX_ALLOWANCE).contains(&v)
}

/// `GET /api/v1/admin/users?status=pending|all`
pub async fn handle_list(env: Env, req: &Request) -> Result<Response> {
    if !is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let status = req
        .url()
        .ok()
        .and_then(|u| {
            u.query_pairs()
                .find(|(k, _)| k == "status")
                .map(|(_, v)| v.into_owned())
        })
        .filter(|s| !s.is_empty() && s != "all");
    let db = store::db(&env)?;
    let users = store::list_users(&db, status.as_deref()).await?;
    let views: Vec<store::UserView> = users.iter().map(store::UserView::from).collect();
    Response::from_json(&json!({ "users": views }))
}

/// `POST /api/v1/admin/approve {user_id, deploy_allowance}` — sets the
/// status to approved, mints the one-shot signin token, returns it once.
pub async fn handle_approve(env: Env, req: &mut Request) -> Result<Response> {
    if !is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let Some(body) = http::json_body::<AllowanceIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {user_id, deploy_allowance}");
    };
    if !valid_allowance(body.deploy_allowance) {
        return http::bad_request("BAD_ALLOWANCE", "deploy_allowance 0..=500");
    }
    let db = store::db(&env)?;
    let Some(user) = load(&db, &body.user_id).await? else {
        return http::not_found("no such user");
    };
    let Some(next) = transition(status_of(&user)?, AdminAction::Approve) else {
        return http::conflict("approve only from pending");
    };
    apply_allowance(&db, &body, &next).await?;
    // Mint the signin token; only its hash is stored.
    let token = auth::new_token();
    let now = auth::now_ms();
    store::set_auth(&db, &user.id, &auth::hash_token(&token), now).await?;
    audit(&db, "approve", &user.id, &allowance_meta(&body), now).await?;
    let user = refresh(&db, &body.user_id).await?;
    Response::from_json(&json!({ "token": token, "user": store::UserView::from(&user) }))
}

/// `POST /api/v1/admin/reject {user_id, reason?}` — terminal (204).
pub async fn handle_reject(env: Env, req: &mut Request) -> Result<Response> {
    if !is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let Some(body) = http::json_body::<RejectIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {user_id, reason?}");
    };
    let db = store::db(&env)?;
    let Some(user) = load(&db, &body.user_id).await? else {
        return http::not_found("no such user");
    };
    let Some(next) = transition(status_of(&user)?, AdminAction::Reject) else {
        return http::conflict("reject only from pending");
    };
    store::set_status(&db, &user.id, next.as_str(), None).await?;
    if !body.reason.trim().is_empty() {
        store::set_note(&db, &user.id, body.reason.trim()).await?;
    }
    audit(&db, "reject", &user.id, "", auth::now_ms()).await?;
    Response::empty().map(|r| r.with_status(204))
}

/// `POST /api/v1/admin/allowance {user_id, deploy_allowance}` — sets the
/// number of future deploys the tenant may run; returns the updated user.
pub async fn handle_allowance(env: Env, req: &mut Request) -> Result<Response> {
    if !is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let Some(body) = http::json_body::<AllowanceIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {user_id, deploy_allowance}");
    };
    if !valid_allowance(body.deploy_allowance) {
        return http::bad_request("BAD_ALLOWANCE", "deploy_allowance 0..=500");
    }
    let db = store::db(&env)?;
    let Some(user) = load(&db, &body.user_id).await? else {
        return http::not_found("no such user");
    };
    if user.status == "rejected" {
        return http::conflict("rejected is terminal");
    }
    store::set_allowance(&db, &user.id, body.deploy_allowance).await?;
    audit(
        &db,
        "allowance",
        &user.id,
        &allowance_meta(&body),
        auth::now_ms(),
    )
    .await?;
    let user = refresh(&db, &body.user_id).await?;
    Response::from_json(&store::UserView::from(&user))
}

/// `POST /api/v1/admin/suspend` / `.../reactivate {user_id}`.
pub async fn handle_suspend(env: Env, req: &mut Request) -> Result<Response> {
    status_change(env, req, AdminAction::Suspend, "suspend").await
}

pub async fn handle_reactivate(env: Env, req: &mut Request) -> Result<Response> {
    status_change(env, req, AdminAction::Reactivate, "reactivate").await
}

async fn status_change(
    env: Env,
    req: &mut Request,
    action: AdminAction,
    action_name: &'static str,
) -> Result<Response> {
    if !is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let Some(body) = http::json_body::<UserIdIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {user_id}");
    };
    let db = store::db(&env)?;
    let Some(user) = load(&db, &body.user_id).await? else {
        return http::not_found("no such user");
    };
    let Some(next) = transition(status_of(&user)?, action) else {
        return http::conflict("illegal status transition");
    };
    store::set_status(&db, &user.id, next.as_str(), Some("admin")).await?;
    audit(&db, action_name, &user.id, "", auth::now_ms()).await?;
    let user = refresh(&db, &body.user_id).await?;
    Response::from_json(&store::UserView::from(&user))
}

// ------------------------------------------------------------ helpers

/// Body parsing runs after this guard in every admin handler:
/// `if !is_admin(req.headers(), &env) { return http::unauthorized(); }`

async fn load(db: &worker::d1::D1Database, user_id: &str) -> Result<Option<store::UserRow>> {
    if user_id.trim().is_empty() {
        return Ok(None);
    }
    store::user_by_id(db, user_id).await
}

fn status_of(user: &store::UserRow) -> Result<UserStatus> {
    UserStatus::parse(&user.status)
        .ok_or_else(|| worker::Error::RustError(format!("user {} has unknown status", user.id)))
}

async fn apply_allowance(
    db: &worker::d1::D1Database,
    body: &AllowanceIn,
    next: &UserStatus,
) -> Result<()> {
    store::set_status(db, &body.user_id, next.as_str(), Some("admin")).await?;
    store::set_allowance(db, &body.user_id, body.deploy_allowance).await
}

fn allowance_meta(body: &AllowanceIn) -> String {
    json!({ "deploy_allowance": body.deploy_allowance }).to_string()
}

async fn audit(
    db: &worker::d1::D1Database,
    action: &str,
    subject: &str,
    meta: &str,
    now: i64,
) -> Result<()> {
    store::append_audit(db, "admin", action, subject, meta, now).await
}

async fn refresh(db: &worker::d1::D1Database, user_id: &str) -> Result<store::UserRow> {
    store::user_by_id(db, user_id)
        .await?
        .ok_or_else(|| worker::Error::RustError("user vanished mid-transaction".to_string()))
}

#[derive(Deserialize)]
pub struct AllowanceIn {
    pub user_id: String,
    pub deploy_allowance: i64,
}

#[derive(Deserialize)]
pub struct RejectIn {
    pub user_id: String,
    #[serde(default)]
    pub reason: String,
}

#[derive(Deserialize)]
pub struct UserIdIn {
    pub user_id: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn happy_status_path() {
        // pending -> approved -> suspended -> approved (reactivate)
        assert_eq!(
            transition(UserStatus::Pending, AdminAction::Approve),
            Some(UserStatus::Approved)
        );
        assert_eq!(
            transition(UserStatus::Approved, AdminAction::Suspend),
            Some(UserStatus::Suspended)
        );
        assert_eq!(
            transition(UserStatus::Suspended, AdminAction::Reactivate),
            Some(UserStatus::Approved)
        );
    }

    #[test]
    fn reject_is_terminal() {
        assert_eq!(
            transition(UserStatus::Pending, AdminAction::Reject),
            Some(UserStatus::Rejected)
        );
        for action in [
            AdminAction::Approve,
            AdminAction::Reject,
            AdminAction::Suspend,
            AdminAction::Reactivate,
        ] {
            assert_eq!(transition(UserStatus::Rejected, action), None);
        }
    }

    #[test]
    fn illegal_transitions_rejected() {
        assert_eq!(transition(UserStatus::Approved, AdminAction::Approve), None);
        assert_eq!(transition(UserStatus::Pending, AdminAction::Suspend), None); // not live yet
        assert_eq!(
            transition(UserStatus::Pending, AdminAction::Reactivate),
            None
        );
        assert_eq!(
            transition(UserStatus::Suspended, AdminAction::Suspend),
            None
        );
        assert_eq!(
            transition(UserStatus::Suspended, AdminAction::Approve),
            None
        );
    }

    #[test]
    fn status_names_roundtrip() {
        for (name, s) in [
            ("pending", UserStatus::Pending),
            ("approved", UserStatus::Approved),
            ("suspended", UserStatus::Suspended),
            ("rejected", UserStatus::Rejected),
        ] {
            assert_eq!(UserStatus::parse(name), Some(s));
            assert_eq!(s.as_str(), name);
        }
        assert_eq!(UserStatus::parse("deleted"), None);
    }

    #[test]
    fn allowance_bounds() {
        assert!(valid_allowance(0));
        assert!(valid_allowance(25));
        assert!(!valid_allowance(-1));
        assert!(!valid_allowance(MAX_ALLOWANCE + 1));
    }
}

// ---------------------------------------------------- token management (E)

#[derive(Deserialize)]
struct MintTokensIn {
    count: i64,
    #[serde(default)]
    note: String,
}

#[derive(Deserialize)]
struct CancelTokenIn {
    code: String,
}

/// `GET /api/v1/admin/tokens?status=active|used|cancelled|all`
pub async fn handle_list_tokens(env: Env, req: &Request) -> Result<Response> {
    if !is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let status = req
        .url()
        .ok()
        .and_then(|u| {
            u.query_pairs()
                .find(|(k, _)| k == "status")
                .map(|(_, v)| v.into_owned())
        })
        .filter(|s| !s.is_empty() && s != "all");
    let db = store::db(&env)?;
    let tokens = store::list_shop_tokens(&db, status.as_deref()).await?;
    Response::from_json(&json!({ "tokens": tokens }))
}

/// `POST /api/v1/admin/tokens/mint {count, note?}` -> {tokens:[...]}
pub async fn handle_mint_tokens(env: Env, req: &mut Request) -> Result<Response> {
    if !is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let Some(body) = http::json_body::<MintTokensIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {count, note?}");
    };
    if !(1..=100).contains(&body.count) {
        return http::bad_request("BAD_COUNT", "count must be 1..=100");
    }
    let db = store::db(&env)?;
    let now = auth::now_ms();
    let tokens = store::mint_shop_tokens(&db, body.count as usize, &body.note, now).await?;
    store::append_audit(
        &db,
        "admin",
        "tokens.mint",
        "",
        &format!("count={}", body.count),
        now,
    )
    .await?;
    Response::from_json(&json!({ "tokens": tokens }))
}

/// `POST /api/v1/admin/tokens/cancel {code}` -> {token}
pub async fn handle_cancel_token(env: Env, req: &mut Request) -> Result<Response> {
    if !is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let Some(body) = http::json_body::<CancelTokenIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {code}");
    };
    let db = store::db(&env)?;
    let now = auth::now_ms();
    // Unknown or already-used code: a client mistake, not a crash.
    let token = match store::cancel_shop_token(&db, &body.code, now).await {
        Ok(t) => t,
        Err(e) => {
            let msg = e.to_string();
            let code = if msg.contains("unknown token") {
                "UNKNOWN_TOKEN"
            } else {
                "TOKEN_NOT_ACTIVE"
            };
            return http::json_error(400, code, "that code cannot be cancelled");
        }
    };
    store::append_audit(&db, "admin", "tokens.cancel", &body.code, "", now).await?;
    Response::from_json(&json!({ "token": token }))
}
