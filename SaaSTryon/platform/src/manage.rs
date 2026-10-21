/* manage.rs - the admin (and owner) control plane over the shops: the
settings, the per-shop platform codes, the bundles and the redeploys.

   Everything here is API-only: the admin console talks to these
   endpoints, the platform talks to Cloudflare, and the shop owner can do
   the same for their own shop. A shop delete is total: the Worker
   script, its per-shop database, its custom domains, its images in the
   shared bucket, its landing files and its rows in the platform
   database all go. */
use serde::Deserialize;
use serde_json::json;
use worker::{Env, FormEntry, Request, Response, Result};

use crate::deployer::bundle::{BundleSource, R2BundleSource};
use crate::deployer::cf_api::{call_with_retry, CfBody, CfConfig, CfRequest, Transport};
use crate::deployer::{d1_name, DeployInputs};
use crate::{admin, auth, http, shops, store};

/// Where the bundles live in the BUNDLES bucket.
pub const BUNDLE_PREFIX: &str = "bundles";

#[derive(Deserialize)]
pub struct SettingsIn {
    pub name: Option<String>,
    pub tier: Option<String>,
    pub status: Option<String>,
}

#[derive(Deserialize)]
pub struct RedeployIn {
    pub bundle_id: String,
}

#[derive(Deserialize)]
pub struct MintIn {
    pub count: Option<i64>,
    pub note: Option<String>,
}

/// A code the owner claims for their shop.
#[derive(Deserialize)]
pub struct ClaimIn {
    pub code: String,
    #[serde(default)]
    pub shop_id: Option<String>,
}

// ------------------------------------------------------------- settings

/// `PATCH /api/v1/admin/shops/{id}` - the shop's settings.
pub async fn handle_update(env: Env, req: &mut Request, id: &str) -> Result<Response> {
    if !admin::is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let db = store::db(&env)?;
    let Some(shop) = shops::shop_by_id(&db, id).await? else {
        return http::not_found("no such shop");
    };
    let Some(body) = http::json_body::<SettingsIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {name?, tier?, status?}");
    };
    let name = body
        .name
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| shop.name.clone());
    let tier = body
        .tier
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| shop.tier.clone());
    let status = body
        .status
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| shop.status.clone());
    store::write(
        &db,
        "UPDATE shops SET name = ?, tier = ?, status = ? WHERE id = ?",
        vec![
            name.clone().into(),
            tier.clone().into(),
            status.clone().into(),
            shop.id.clone().into(),
        ],
    )
    .await?;
    store::append_audit(
        &db,
        &shop.id,
        "shop.settings",
        &shop.id,
        &format!("{tier}/{status}"),
        auth::now_ms(),
    )
    .await?;
    Response::from_json(
        &json!({ "ok": true, "id": shop.id, "name": name, "tier": tier, "status": status }),
    )
}

// --------------------------------------------------------------- delete

/// `DELETE /api/v1/admin/shops/{id}` - the shop is gone, with
/// everything that belonged to it.
pub async fn handle_delete(env: Env, req: &Request, id: &str) -> Result<Response> {
    if !admin::is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let db = store::db(&env)?;
    let Some(shop) = shops::shop_by_id(&db, id).await? else {
        return http::not_found("no such shop");
    };
    let cfg = match CfConfig::from_env(&env) {
        Ok(c) => c,
        Err(e) => return http::json_error(500, "NO_CF", &e),
    };
    let transport = crate::deployer::cf_api::FetchTransport::new(cfg.clone());
    let mut removed: Vec<String> = Vec::new();

    // 1. the custom domains of this shop.
    for h in shops::hostnames_of(&db, &shop.id).await? {
        let _ = call_with_retry(
            &transport,
            CfRequest {
                method: worker::Method::Delete,
                path: format!("/accounts/{}/workers/domains/{}", cfg.account, h.hostname),
                body: CfBody::Empty,
                jwt: None,
            },
        )
        .await;
        removed.push(format!("domain {}", h.hostname));
    }

    // 2. the images of this shop in the shared bucket.
    if let Ok(bucket) = env.bucket("PRODUCTS") {
        let id8 = shop
            .cluster_id
            .strip_prefix("shop-")
            .unwrap_or(&shop.cluster_id);
        let prefix = format!("shops/{id8}/");
        if let Ok(objects) = bucket.list().prefix(&prefix).execute().await {
            for o in objects.objects() {
                let _ = bucket.delete(&o.key()).await;
            }
            removed.push(format!("images under {prefix}"));
        }
    }

    // 3. the landing files of this shop.
    if let Ok(bucket) = env.bucket("BUNDLES") {
        let prefix = format!("landings/{}/", shop.id);
        if let Ok(objects) = bucket.list().prefix(&prefix).execute().await {
            for o in objects.objects() {
                let _ = bucket.delete(&o.key()).await;
            }
        }
    }

    // 4. the Worker script and its per-shop database.
    if !shop.cluster_id.is_empty() {
        let _ = call_with_retry(
            &transport,
            CfRequest {
                method: worker::Method::Delete,
                path: format!(
                    "/accounts/{}/workers/scripts/{}",
                    cfg.account, shop.cluster_id
                ),
                body: CfBody::Empty,
                jwt: None,
            },
        )
        .await;
        removed.push(format!("script {}", shop.cluster_id));
    }
    let id8 = shop
        .cluster_id
        .strip_prefix("shop-")
        .unwrap_or(&shop.cluster_id)
        .to_string();
    if let Ok(databases) = call_with_retry(
        &transport,
        CfRequest {
            method: worker::Method::Get,
            path: format!("/accounts/{}/d1/database?per_page=100", cfg.account),
            body: CfBody::Empty,
            jwt: None,
        },
    )
    .await
    {
        let list = crate::deployer::cf_api::result_of(&databases);
        for d in list.as_array().cloned().unwrap_or_default() {
            if d.get("name").and_then(|n| n.as_str()) == Some(d1_name(&id8).as_str()) {
                if let Some(uuid) = d.get("uuid").and_then(|u| u.as_str()) {
                    let _ = call_with_retry(
                        &transport,
                        CfRequest {
                            method: worker::Method::Delete,
                            path: format!("/accounts/{}/d1/database/{}", cfg.account, uuid),
                            body: CfBody::Empty,
                            jwt: None,
                        },
                    )
                    .await;
                    removed.push(format!("database {uuid}"));
                }
            }
        }
    }

    // 5. the rows in the platform database.
    for sql in [
        "DELETE FROM hostnames WHERE shop_id = ?",
        "DELETE FROM credits WHERE shop_id = ?",
        "DELETE FROM shop_tokens WHERE shop_id = ?",
        "DELETE FROM credit_requests WHERE shop_id = ?",
        "DELETE FROM audit WHERE subject = ?",
        "DELETE FROM shops WHERE id = ?",
    ] {
        let _ = store::write(&db, sql, vec![shop.id.clone().into()]).await;
    }
    store::append_audit(&db, "admin", "shop.delete", &shop.id, "", auth::now_ms()).await?;

    Response::from_json(&json!({ "ok": true, "deleted": shop.id, "removed": removed }))
}

// --------------------------------------------------------------- tokens

/// `POST /api/v1/admin/shops/{id}/tokens {count?, note?}` - codes that
/// belong to this shop from the start.
pub async fn handle_mint_for(env: Env, req: &mut Request, id: &str) -> Result<Response> {
    if !admin::is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let db = store::db(&env)?;
    let Some(shop) = shops::shop_by_id(&db, id).await? else {
        return http::not_found("no such shop");
    };
    let Some(body) = http::json_body::<MintIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {count?, note?}");
    };
    let count = body.count.unwrap_or(1).clamp(1, 50) as usize;
    let note = body.note.unwrap_or_default();
    let now = auth::now_ms();
    let mut minted = Vec::new();
    for _ in 0..count {
        let code = shops::new_code();
        let row = shops::ShopToken {
            code: code.clone(),
            shop_id: Some(shop.id.clone()),
            status: "active".into(),
            created_ms: now,
            redeemed_ms: None,
            redeemed_by: None,
            cancelled_ms: None,
            note: Some(note.clone()),
        };
        store::write(
            &db,
            "INSERT INTO shop_tokens (code,shop_id,status,created_ms,note) VALUES (?,?,'active',?,?)",
            vec![
                code.clone().into(),
                shop.id.clone().into(),
                auth::now_ms().into(),
                note.clone().into(),
            ],
        )
        .await?;
        minted.push(row);
    }
    store::append_audit(&db, &shop.id, "tokens.mint", &shop.id, &note, now).await?;
    Response::from_json(&json!({ "ok": true, "tokens": minted }))
}

/// `POST /api/v1/shop/tokens {count?, note?}` - the owner mints a code
/// for their own shop.
pub async fn handle_owner_mint(env: Env, req: &mut Request) -> Result<Response> {
    let db = store::db(&env)?;
    let Some(session) = auth::verify_session(&db, req.headers()).await? else {
        return http::unauthorized();
    };
    let Some(shop) = shops::owned_shop(&db, &session.user_id, None).await? else {
        return http::json_error(404, "NO_SHOP", "deploy a shop first");
    };
    let Some(body) = http::json_body::<MintIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {count?, note?}");
    };
    let count = body.count.unwrap_or(1).clamp(1, 50) as usize;
    let note = body.note.unwrap_or_default();
    let now = auth::now_ms();
    let mut minted = Vec::new();
    for _ in 0..count {
        let code = shops::new_code();
        let row = shops::ShopToken {
            code: code.clone(),
            shop_id: Some(shop.id.clone()),
            status: "active".into(),
            created_ms: now,
            redeemed_ms: None,
            redeemed_by: None,
            cancelled_ms: None,
            note: Some(note.clone()),
        };
        store::write(
            &db,
            "INSERT INTO shop_tokens (code,shop_id,status,created_ms,note) VALUES (?,?,'active',?,?)",
            vec![
                code.clone().into(),
                shop.id.clone().into(),
                auth::now_ms().into(),
                note.clone().into(),
            ],
        )
        .await?;
        minted.push(row);
    }
    store::append_audit(&db, &shop.id, "tokens.mint", &shop.id, &note, now).await?;
    Response::from_json(&json!({ "ok": true, "tokens": minted }))
}

/// `POST /api/v1/admin/tokens/{code}/delete` - the code is removed for
/// good (a frozen code keeps its row, a deleted one is gone).
pub async fn handle_token_delete(env: Env, req: &Request, code: &str) -> Result<Response> {
    if !admin::is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let db = store::db(&env)?;
    let Some(tok) = shops::token_by_code(&db, code).await? else {
        return http::not_found("no such code");
    };
    store::write(
        &db,
        "DELETE FROM shop_tokens WHERE code = ?",
        vec![code.to_string().into()],
    )
    .await?;
    if let Some(shop_id) = &tok.shop_id {
        store::append_audit(&db, shop_id, "tokens.delete", code, "", auth::now_ms()).await?;
    }
    Response::from_json(&json!({ "ok": true, "deleted": code }))
}

// -------------------------------------------------------------- bundles

/// The bundle versions in the BUNDLES bucket (the folder names).
pub async fn list_bundles(env: &Env) -> Result<Vec<String>> {
    let bucket = env
        .bucket("BUNDLES")
        .map_err(|_| worker::Error::RustError("R2 BUNDLES binding not configured".into()))?;
    let objects = bucket
        .list()
        .prefix(&format!("{BUNDLE_PREFIX}/"))
        .execute()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let mut ids: Vec<String> = objects
        .objects()
        .iter()
        .map(|o| o.key().to_string())
        .filter_map(|k| {
            k.strip_prefix(&format!("{BUNDLE_PREFIX}/"))
                .map(|rest| rest.to_string())
        })
        .filter_map(|rest| rest.split('/').next().map(|s| s.to_string()))
        .collect();
    ids.sort();
    ids.dedup();
    Ok(ids)
}

/// `GET /api/v1/admin/bundles` - the versions we can deploy.
pub async fn handle_bundles(env: Env, req: &Request) -> Result<Response> {
    if !admin::is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let ids = list_bundles(&env).await?;
    Response::from_json(&json!({ "bundles": ids }))
}

/// `POST /api/v1/admin/bundles` - upload a bundle (multipart: the
/// files of `bundles/<version>/…`). The manifest decides the layout.
pub async fn handle_bundle_upload(env: Env, mut req: Request) -> Result<Response> {
    if !admin::is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let bucket = env
        .bucket("BUNDLES")
        .map_err(|_| worker::Error::RustError("R2 BUNDLES binding not configured".into()))?;
    let version = req
        .url()
        .ok()
        .and_then(|u| {
            u.query_pairs()
                .find(|(k, _)| k == "version")
                .map(|(_, v)| v.into_owned())
        })
        .unwrap_or_default()
        .trim()
        .to_string();
    if version.is_empty()
        || !version
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
    {
        return http::bad_request("BAD_VERSION", "the version label is required");
    }
    let form = req
        .form_data()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let mut stored: Vec<String> = Vec::new();
    // Every file arrives under the field name "file"; the file's name is
    // its path inside the bundle (the browser sends the relative path).
    for entry in form.get_all("file").unwrap_or_default() {
        let FormEntry::File(file) = entry else {
            continue;
        };
        let bytes = file
            .bytes()
            .await
            .map_err(|e| worker::Error::RustError(e.to_string()))?;
        let rel = file.name().to_string();
        if rel.contains("..") || rel.starts_with('/') {
            continue;
        }
        let key = format!("{BUNDLE_PREFIX}/{version}/{rel}");
        bucket
            .put(&key, bytes)
            .execute()
            .await
            .map_err(|e| worker::Error::RustError(e.to_string()))?;
        stored.push(rel);
    }
    if stored.is_empty() {
        return http::bad_request("NO_FILES", "upload the bundle files");
    }
    Response::from_json(&json!({ "ok": true, "version": version, "files": stored }))
}

/// `GET /api/v1/shop/bundles` - the versions the owner may move their
/// shop to.
pub async fn handle_owner_bundles(env: Env, req: &Request) -> Result<Response> {
    let db = store::db(&env)?;
    if auth::verify_session(&db, req.headers()).await?.is_none() {
        return http::unauthorized();
    }
    let ids = list_bundles(&env).await?;
    Response::from_json(&json!({ "bundles": ids }))
}

/// `POST /api/v1/shop/tokens/claim {code}` - the owner takes a code the
/// admin gave them: it becomes bound to their shop and buys credits.
pub async fn handle_owner_claim(env: Env, req: &mut Request) -> Result<Response> {
    let db = store::db(&env)?;
    let Some(session) = auth::verify_session(&db, req.headers()).await? else {
        return http::unauthorized();
    };
    let Some(body) = http::json_body::<ClaimIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {code}");
    };
    let code = body.code.trim().to_string();
    if !shops::valid_code(&code) {
        return http::bad_request("BAD_CODE", "that is not a 4-digit code");
    }
    let Some(shop) = shops::owned_shop(&db, &session.user_id, body.shop_id.as_deref()).await?
    else {
        return http::json_error(404, "NO_SHOP", "deploy a shop first");
    };
    // A code that is already bound to another shop stays there: the
    // claim never steals it.
    if let Some(existing) = shops::token_by_code(&db, &code).await? {
        if let Some(owner) = existing.shop_id.as_deref() {
            if owner != shop.id {
                return http::json_error(
                    400,
                    "TOKEN_BOUND",
                    "that code already belongs to another shop",
                );
            }
        }
    }
    let now = auth::now_ms();
    let claimed = match shops::redeem_shop_token(&db, &code, &shop.id, now).await {
        Ok(t) => t,
        Err(e) => {
            let msg = e.to_string();
            let code = if msg.contains("unknown token") {
                "UNKNOWN_TOKEN"
            } else {
                "TOKEN_USED"
            };
            return http::json_error(400, code, "that code cannot be claimed");
        }
    };
    shops::grant_credits(&db, &shop.id, 1, now).await?;
    store::append_audit(&db, &shop.id, "tokens.claim", &code, "", now).await?;
    Response::from_json(&json!({ "ok": true, "token": claimed, "shop_id": shop.id }))
}

/// `POST /api/v1/admin/bundles/{version}/deploy-all` - every shop moves
/// to that bundle.
pub async fn handle_bundle_deploy_all(env: Env, req: &Request, version: &str) -> Result<Response> {
    if !admin::is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let db = store::db(&env)?;
    let mut results = Vec::new();
    for shop in shops::all_shops(&db).await? {
        let res = match run_deploy(&env, &shop, version).await {
            Ok(r) => json!({ "shop_id": shop.id, "ok": true, "url": r.url }),
            Err(e) => json!({ "shop_id": shop.id, "ok": false, "error": e }),
        };
        results.push(res);
    }
    Response::from_json(&json!({ "ok": true, "version": version, "results": results }))
}

/// `POST /api/v1/admin/shops/{id}/owner-token` - a new studio token.
/// The token is a secret of the shop script, so this redeploys the shop
/// (the data stays).
pub async fn handle_rotate_owner_token(env: Env, req: &Request, id: &str) -> Result<Response> {
    if !admin::is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let db = store::db(&env)?;
    let Some(shop) = shops::shop_by_id(&db, id).await? else {
        return http::not_found("no such shop");
    };
    let bundle = if shop.depot_version.is_empty() {
        list_bundles(&env)
            .await?
            .last()
            .cloned()
            .unwrap_or_default()
    } else {
        shop.depot_version.clone()
    };
    if bundle.is_empty() {
        return http::json_error(400, "NO_BUNDLE", "no bundle to redeploy from");
    }
    let out = match run_deploy(&env, &shop, &bundle).await {
        Ok(o) => o,
        Err(e) => return http::json_error(500, "DEPLOY_FAILED", &e),
    };
    let fresh = shops::shop_by_id(&db, id).await?;
    Response::from_json(&json!({
        "ok": true,
        "shop_id": id,
        "owner_token": fresh.and_then(|s| s.owner_token),
        "url": out.url,
    }))
}

/// `POST /api/v1/admin/shops/{id}/redeploy {bundle_id}` - one shop on a
/// new bundle.
pub async fn handle_redeploy(env: Env, req: &mut Request, id: &str) -> Result<Response> {
    if !admin::is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let db = store::db(&env)?;
    let Some(shop) = shops::shop_by_id(&db, id).await? else {
        return http::not_found("no such shop");
    };
    let Some(body) = http::json_body::<RedeployIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {bundle_id}");
    };
    match run_deploy(&env, &shop, &body.bundle_id).await {
        Ok(o) => Response::from_json(&json!({ "ok": true, "shop_id": o.shop_id, "url": o.url })),
        Err(e) => http::json_error(500, "DEPLOY_FAILED", &e),
    }
}

/// `POST /api/v1/shop/redeploy {bundle_id}` - the owner moves their own
/// shop to another bundle.
pub async fn handle_owner_redeploy(env: Env, req: &mut Request) -> Result<Response> {
    let db = store::db(&env)?;
    let Some(session) = auth::verify_session(&db, req.headers()).await? else {
        return http::unauthorized();
    };
    let Some(shop) = shops::owned_shop(&db, &session.user_id, None).await? else {
        return http::json_error(404, "NO_SHOP", "deploy a shop first");
    };
    let Some(body) = http::json_body::<RedeployIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {bundle_id}");
    };
    match run_deploy(&env, &shop, &body.bundle_id).await {
        Ok(o) => Response::from_json(&json!({ "ok": true, "shop_id": o.shop_id, "url": o.url })),
        Err(e) => http::json_error(500, "DEPLOY_FAILED", &e),
    }
}

/// What a redeploy leaves behind: the shop keeps its script and its
/// data, so only the bundle and the studio token change.
pub struct DeployOutcome {
    pub shop_id: String,
    pub url: Option<String>,
}

/// Deploy one shop from a bundle (the script and its database are
/// reused, so the shop keeps its data).
async fn run_deploy(
    env: &Env,
    shop: &shops::Shop,
    bundle_id: &str,
) -> Result<DeployOutcome, String> {
    let cfg = CfConfig::from_env(env).map_err(|e| e.to_string())?;
    let bucket = env
        .bucket("BUNDLES")
        .map_err(|_| "the BUNDLES bucket is missing".to_string())?;
    let source = R2BundleSource { bucket };
    let input = DeployInputs {
        owner_id: shop.owner_id.clone(),
        subdomain: shop.subdomain.clone(),
        shop_name: shop.name.clone(),
        tier: shop.tier.clone(),
        bundle_id: bundle_id.to_string(),
        now_ms: auth::now_ms(),
    };
    match crate::deployer::deploy_shop_with_source(env, source, &cfg, input).await {
        Ok(r) => Ok(DeployOutcome {
            shop_id: r.shop_id,
            url: r.custom_url,
        }),
        Err(e) => Err(e.to_string()),
    }
}
