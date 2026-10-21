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

use crate::{admin, auth, credits, dashboard, deploy, domain, landing, manage, outbound};

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
        // Phase G: the customer's own domain and landing page.
        (Method::Post, ["shop", "domain"]) => domain::handle_domain(env, &mut req).await,
        (Method::Post, ["shop", "landing", "file"]) => landing::handle_upload(env, req).await,
        (Method::Post, ["shop", "landing", "apply"]) => landing::handle_apply(env, &mut req).await,
        (Method::Get, ["shop", "landing"]) => landing::handle_list(env, &req).await,
        // Phase G: manual billing gate for extra tryon_tokens.
        (Method::Post, ["shop", "credits", "request"]) => {
            credits::handle_shop_request(env, &mut req).await
        }
        (Method::Get, ["admin", "credits"]) => credits::handle_admin_list(env, &req).await,
        (Method::Post, ["admin", "credits", "approve"]) => {
            credits::handle_admin_approve(env, &mut req).await
        }
        (Method::Post, ["admin", "credits", "reject"]) => {
            credits::handle_admin_reject(env, &mut req).await
        }
        // Phase G: the dashboard views (shops + activity).
        (Method::Get, ["shops"]) => dashboard::handle_owner_shops(env, &req).await,
        (Method::Get, ["shops", "activity"]) => dashboard::handle_owner_activity(env, &req).await,
        (Method::Get, ["admin", "shops"]) => dashboard::handle_admin_shops(env, &req).await,
        (Method::Get, ["admin", "activity"]) => dashboard::handle_admin_activity(env, &req).await,
        // Phase H: the admin control plane over the shops, the codes and
        // the bundles.
        (Method::Patch, ["admin", "shops", id]) => manage::handle_update(env, &mut req, id).await,
        (Method::Delete, ["admin", "shops", id]) => manage::handle_delete(env, &req, id).await,
        (Method::Post, ["admin", "shops", id, "redeploy"]) => {
            manage::handle_redeploy(env, &mut req, id).await
        }
        (Method::Post, ["admin", "shops", id, "tokens"]) => {
            manage::handle_mint_for(env, &mut req, id).await
        }
        (Method::Post, ["admin", "shops", id, "owner-token"]) => {
            manage::handle_set_owner_token(env, &mut req, id).await
        }
        (Method::Post, ["admin", "bundles", version, "deploy-all"]) => {
            manage::handle_bundle_deploy_all(env, &req, version).await
        }
        (Method::Post, ["admin", "tokens", code, "delete"]) => {
            manage::handle_token_delete(env, &req, code).await
        }
        (Method::Get, ["admin", "bundles"]) => manage::handle_bundles(env, &req).await,
        (Method::Get, ["admin", "tryon-api"]) => manage::handle_tryon_api(env, &req).await,
        (Method::Post, ["admin", "tryon-api"]) => manage::handle_set_tryon_api(env, &mut req).await,
        (Method::Post, ["admin", "platform", "redeploy"]) => {
            manage::handle_platform_redeploy(env, &req).await
        }
        (Method::Post, ["admin", "users", id, "token"]) => {
            manage::handle_set_user_token(env, &mut req, id).await
        }
        (Method::Post, ["admin", "bundles"]) => manage::handle_bundle_upload(env, req).await,
        (Method::Post, ["shop", "tokens"]) => manage::handle_owner_mint(env, &mut req).await,
        (Method::Post, ["shop", "owner-token"]) => {
            manage::handle_owner_set_token(env, &mut req).await
        }
        (Method::Get, ["shop", "credits"]) => manage::handle_shop_credits(env, &req).await,
        (Method::Get, ["shop", "codes"]) => manage::handle_owner_codes(env, &req).await,
        (Method::Post, ["shop", "tokens", "claim"]) => {
            manage::handle_owner_claim(env, &mut req).await
        }
        (Method::Get, ["shop", "bundles"]) => manage::handle_owner_bundles(env, &req).await,
        (Method::Post, ["shop", "redeploy"]) => manage::handle_owner_redeploy(env, &mut req).await,
        // Phase F: the owner-facing deploy form.
        (Method::Post, ["deploy"]) => deploy::handle_deploy(env, &mut req).await,
        // Phase E: the metered Genlook proxy for tenant shops.
        (Method::Get, ["shop", "genlook", rest @ ..]) => {
            outbound::handle_genlook(env, &mut req, rest.join("/")).await
        }
        (Method::Post, ["shop", "genlook", rest @ ..]) => {
            outbound::handle_genlook(env, &mut req, rest.join("/")).await
        }
        (Method::Get, ["health"]) => Response::from_json(&serde_json::json!({ "ok": true })),
        _ => json_error(404, "NOT_FOUND", "unknown /api/v1 command"),
    }
}

/// Static fallthrough: `env.assets("ASSETS").fetch(request)` by name so
/// the binding, not the worker path, decides what is served. When the
/// assets binding is missing entirely (frontend not deployed yet) the API
/// stays usable and pages answer 404.
///
/// The static host does not know the newer media types (a baked try-on
/// clip arrives as `application/octet-stream`); the header is fixed on
/// the way out so the browser treats it as a video.
async fn asset(req: Request, env: &Env) -> Result<Response> {
    let path = req
        .url()
        .ok()
        .map(|u| u.path().to_string())
        .unwrap_or_default();
    match env.assets("ASSETS") {
        Ok(f) => {
            let mut res = f.fetch_request(req).await?;
            let mime = if path.ends_with(".webm") {
                Some("video/webm")
            } else if path.ends_with(".mp4") {
                Some("video/mp4")
            } else {
                None
            };
            if let Some(mime) = mime {
                res.headers_mut().set("content-type", mime);
            }
            Ok(res)
        }
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
