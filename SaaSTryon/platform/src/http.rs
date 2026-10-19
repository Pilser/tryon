/* http.rs - the control-plane router: `/api/v1/<command>` is dispatched to
the command handlers in `auth.rs` (public) and `admin.rs` (guarded);
every other request falls through to the static-assets binding (the
React/StyleX frontend; assets-first routing never invokes the worker for
pages — PLATFORM.md §4.1 C1).

REST contract — FROZEN for Phase B (shops/provisioning/deployer are
Phase C+ and will extend this table):

  POST /api/v1/signup            {email, contact, shop_name?}   200 {status:"pending"}
                                 |                |               400 BAD_EMAIL / BAD_CONTACT / BAD_SHOP_NAME / BAD_JSON
                                 |                |               409 EMAIL_TAKEN
  POST /api/v1/login             {token}                        200 {session_id, user}   401 UNAUTHORIZED
  POST /api/v1/revoke            (Bearer session)               200 {ok:true}
  GET  /api/v1/me                (Bearer session)               200 {user, deploy_allowance, deploy_used}
                                                                401 UNAUTHORIZED | 403 NOT_ACTIVE/SUSPENDED/REJECTED
  GET  /api/v1/admin/users?status=pending|all
                                 (Bearer ADMIN_TOKEN)           200 {users:[...]}
  POST /api/v1/admin/approve     {user_id, deploy_allowance}    200 {token:"plat_...", user}
  POST /api/v1/admin/reject      {user_id, reason?}             204 | 409 when terminal
  POST /api/v1/admin/allowance   {user_id, deploy_allowance}    200 {user}
  POST /api/v1/admin/suspend     {user_id}                      200 {user}
  POST /api/v1/admin/reactivate  {user_id}                      200 {user}

Errors are never 200: JSON `{code, message, status}` with a matching
HTTP status (mirrors the shop's `routes/errors.rs` shape). */
use serde::de::DeserializeOwned;
use worker::{Env, Method, Request, Response, Result};

use crate::{admin, auth};

/// Everything under `/api/v1/*`; anything else is a static asset.
pub async fn route(mut req: Request, env: Env) -> Result<Response> {
    let path = req.path();
    let Some(rest) = path.strip_prefix("/api/v1/") else {
        return asset(req, &env).await;
    };
    let segs: Vec<&str> = rest.split('/').filter(|s| !s.is_empty()).collect();
    match (req.method(), segs.as_slice()) {
        (Method::Post, ["signup"]) => auth::signup(env, &mut req).await,
        (Method::Post, ["login"]) => auth::login(env, &mut req).await,
        (Method::Post, ["revoke"]) => auth::revoke(env, req.headers()).await,
        (Method::Get, ["me"]) => auth::me(env, req.headers()).await,
        (Method::Get, ["admin", "users"]) => admin::handle_list(env, &req).await,
        (Method::Post, ["admin", "approve"]) => admin::handle_approve(env, &mut req).await,
        (Method::Post, ["admin", "reject"]) => admin::handle_reject(env, &mut req).await,
        (Method::Post, ["admin", "allowance"]) => admin::handle_allowance(env, &mut req).await,
        (Method::Post, ["admin", "suspend"]) => admin::handle_suspend(env, &mut req).await,
        (Method::Post, ["admin", "reactivate"]) => admin::handle_reactivate(env, &mut req).await,
        (Method::Get, ["admin", "tokens"]) => admin::handle_list_tokens(env, &req).await,
        (Method::Post, ["admin", "tokens", "mint"]) => {
            admin::handle_mint_tokens(env, &mut req).await
        }
        (Method::Post, ["admin", "tokens", "cancel"]) => {
            admin::handle_cancel_token(env, &mut req).await
        }
        (Method::Post, ["shop", "tokens", "redeem"]) => auth::handle_redeem(env, &mut req).await,
        (Method::Get, ["health"]) => Response::from_json(&serde_json::json!({ "ok": true })),
        _ => json_error(404, "NOT_FOUND", "unknown /api/v1 command"),
    }
}

/// Static fallthrough: `env.assets("ASSETS").fetch(request)` by name so
/// the binding, not the worker path, decides what is served. When the
/// assets binding is missing entirely (frontend not deployed yet) the API
/// stays usable and pages answer 404.
async fn asset(req: Request, env: &Env) -> Result<Response> {
    match env.assets("ASSETS") {
        Ok(f) => f.fetch_request(req).await,
        Err(_) => json_error(404, "NO_FRONTEND", "platform frontend not deployed"),
    }
}

// ------------------------------------------------------- http helpers

/// Parse a JSON body; `None` if the client sent something unparseable.
pub async fn json_body<T: DeserializeOwned>(req: &mut Request) -> Option<T> {
    req.json::<T>().await.ok()
}

/// One error shape for the whole platform API (`{code,message,status}`).
pub fn json_error(status: u16, code: &'static str, message: &str) -> Result<Response> {
    Response::from_json(&serde_json::json!({
        "code": code,
        "message": message,
        "status": status,
    }))
    .map(|r| r.with_status(status))
}

pub fn bad_request(code: &'static str, message: &str) -> Result<Response> {
    json_error(400, code, message)
}

pub fn unauthorized() -> Result<Response> {
    json_error(401, "UNAUTHORIZED", "missing or invalid token")
}

pub fn not_found(message: &str) -> Result<Response> {
    json_error(404, "NOT_FOUND", message)
}

pub fn conflict(message: &str) -> Result<Response> {
    json_error(409, "CONFLICT", message)
}
