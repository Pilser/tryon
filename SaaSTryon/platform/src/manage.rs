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
    /// How many try-on credits the code is worth (rev 0005). Default 1.
    pub credits: Option<i64>,
}

/// The studio token, chosen by hand.
#[derive(Deserialize)]
pub struct OwnerTokenIn {
    pub token: Option<String>,
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
        return http::bad_request("BAD_JSON", "expected {count?, note?, credits?}");
    };
    let count = body.count.unwrap_or(1).clamp(1, 50) as usize;
    let note = body.note.unwrap_or_default();
    let credits = body.credits.unwrap_or(1).clamp(1, 100_000);
    let now = auth::now_ms();
    let minted = shops::mint_shop_tokens_for(&db, &shop.id, count, &note, credits, now).await?;
    store::append_audit(&db, &shop.id, "tokens.mint", &shop.id, &note, now).await?;
    Response::from_json(&json!({ "ok": true, "tokens": minted }))
}

/// `POST /api/v1/shop/tokens {count?, note?, credits?}` - the owner mints
/// a code for their own shop, worth as many credits as they say.
pub async fn handle_owner_mint(env: Env, req: &mut Request) -> Result<Response> {
    let db = store::db(&env)?;
    let Some(session) = auth::verify_session(&db, req.headers()).await? else {
        return http::unauthorized();
    };
    let Some(shop) = shops::owned_shop(&db, &session.user_id, None).await? else {
        return http::json_error(404, "NO_SHOP", "deploy a shop first");
    };
    let Some(body) = http::json_body::<MintIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {count?, note?, credits?}");
    };
    let count = body.count.unwrap_or(1).clamp(1, 50) as usize;
    let note = body.note.unwrap_or_default();
    let credits = body.credits.unwrap_or(1).clamp(1, 100_000);
    let now = auth::now_ms();
    let minted = shops::mint_shop_tokens_for(&db, &shop.id, count, &note, credits, now).await?;
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
    // The code carries its face value (rev 0005): claiming a 25-credit
    // code gives the shop 25 credits.
    shops::grant_credits(&db, &shop.id, claimed.credits, now).await?;
    store::append_audit(&db, &shop.id, "tokens.claim", &code, "", now).await?;
    Response::from_json(&json!({
        "ok": true,
        "token": claimed,
        "shop_id": shop.id,
        "credits": claimed.credits,
        "balance": shops::credits_left(&db, &shop.id).await.unwrap_or(0),
    }))
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
        let res = match run_deploy(&env, &shop, version, None).await {
            Ok(r) => json!({ "shop_id": shop.id, "ok": true, "url": r.url }),
            Err(e) => json!({ "shop_id": shop.id, "ok": false, "error": e }),
        };
        results.push(res);
    }
    Response::from_json(&json!({ "ok": true, "version": version, "results": results }))
}

/// `POST /api/v1/admin/shops/{id}/owner-token {token}` - SET the studio
/// token, chosen by hand.
///
/// The token is a secret of the shop script, so the shop is redeployed
/// with the chosen value (the products, the credits and the landing
/// files stay). Without a body the admin gets a fresh minted one
/// instead - the old "rotate".
pub async fn handle_set_owner_token(env: Env, req: &mut Request, id: &str) -> Result<Response> {
    if !admin::is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let db = store::db(&env)?;
    let Some(shop) = shops::shop_by_id(&db, id).await? else {
        return http::not_found("no such shop");
    };
    let body = http::json_body::<OwnerTokenIn>(req).await;
    let chosen = body.and_then(|b| b.token).map(|t| t.trim().to_string());
    if let Some(token) = chosen.as_deref() {
        if !crate::deployer::valid_studio_token(token) {
            return http::bad_request("BAD_TOKEN", "use 8-64 letters, digits, dash or underscore");
        }
    }
    // No token in the body: the platform mints a fresh, typeable one.
    let token = chosen.unwrap_or_else(crate::deployer::new_studio_token);
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
    let out = match run_deploy(&env, &shop, &bundle, Some(token)).await {
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

/// `POST /api/v1/shop/owner-token {token}` - the owner sets their own
/// studio token (the one they type into /app).
pub async fn handle_owner_set_token(env: Env, req: &mut Request) -> Result<Response> {
    let db = store::db(&env)?;
    let Some(session) = auth::verify_session(&db, req.headers()).await? else {
        return http::unauthorized();
    };
    let Some(shop) = shops::owned_shop(&db, &session.user_id, None).await? else {
        return http::json_error(404, "NO_SHOP", "deploy a shop first");
    };
    let body = http::json_body::<OwnerTokenIn>(req).await;
    let chosen = body.and_then(|b| b.token).map(|t| t.trim().to_string());
    if let Some(token) = chosen.as_deref() {
        if !crate::deployer::valid_studio_token(token) {
            return http::bad_request("BAD_TOKEN", "use 8-64 letters, digits, dash or underscore");
        }
    }
    // No token in the body: the platform mints a fresh, typeable one.
    let token = chosen.unwrap_or_else(crate::deployer::new_studio_token);
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
    let out = match run_deploy(&env, &shop, &bundle, Some(token)).await {
        Ok(o) => o,
        Err(e) => return http::json_error(500, "DEPLOY_FAILED", &e),
    };
    let fresh = shops::shop_by_id(&db, &shop.id).await?;
    Response::from_json(&json!({
        "ok": true,
        "shop_id": shop.id,
        "owner_token": fresh.and_then(|s| s.owner_token),
        "url": out.url,
    }))
}

/// `GET /api/v1/admin/tryon-api` - the TRY-ON API's own balance (the
/// Genlook account). This is the admin's number: it is what the
/// generations actually spend. The shop never sees it.
pub async fn handle_tryon_api(env: Env, req: &Request) -> Result<Response> {
    if !admin::is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let key = match env
        .var("GENLOOK_API_KEY")
        .map(|v| v.to_string())
        .unwrap_or_default()
    {
        k if !k.is_empty() => k,
        _ => {
            return Response::from_json(&json!({
                "configured": false,
                "balance": null,
                "message": "the try-on API key is not set on the platform yet",
            }))
        }
    };
    let url = format!("{}/account/credits", crate::outbound::base(&env));
    let mut headers = worker::Headers::new();
    headers.set("authorization", &format!("Bearer {key}"))?;
    let mut init = worker::RequestInit::new();
    init.with_method(worker::Method::Get);
    init.with_headers(headers);
    let mut upstream = worker::Fetch::Request(worker::Request::new_with_init(&url, &init)?)
        .send()
        .await?;
    let status = upstream.status_code();
    let text = upstream.text().await?;
    if !(200..300).contains(&status) {
        return Response::from_json(&json!({
            "configured": true,
            "balance": null,
            "message": format!("the try-on API answered {status}"),
        }));
    }
    let balance = serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| v.get("creditBalance").and_then(|b| b.as_i64()));
    Response::from_json(&json!({
        "configured": true,
        "balance": balance,
        "message": null,
    }))
}

/// `GET /api/v1/shop/codes` - the owner's own code ledger: every code
/// that belongs to one of their shops or that one of their shops
/// redeemed, with what it was worth and what became of it.
pub async fn handle_owner_codes(env: Env, req: &Request) -> Result<Response> {
    let db = store::db(&env)?;
    let Some(session) = auth::verify_session(&db, req.headers()).await? else {
        return http::unauthorized();
    };
    let shops = shops::all_shops(&db).await?;
    let mine: Vec<String> = shops
        .iter()
        .filter(|s| s.owner_id == session.user_id)
        .map(|s| s.id.clone())
        .collect();
    let all = shops::list_shop_tokens(&db, None).await?;
    let codes: Vec<shops::ShopToken> = all
        .into_iter()
        .filter(|t| {
            t.shop_id
                .as_deref()
                .map(|id| mine.iter().any(|m| m == id))
                .unwrap_or(false)
                || t.redeemed_by
                    .as_deref()
                    .map(|id| mine.iter().any(|m| m == id))
                    .unwrap_or(false)
        })
        .collect();
    let spent: i64 = codes
        .iter()
        .filter(|t| t.status == "used")
        .map(|t| t.credits)
        .sum();
    Response::from_json(&json!({
        "codes": codes,
        "credits_from_codes": spent,
        "shops": mine,
    }))
}

/// `GET /api/v1/shop/credits` - the SHOP asks the platform what it has
/// got: the balance, how much of it came from the codes it redeemed,
/// and the codes themselves. Authenticated with the shop's
/// PLATFORM_TOKEN (the cluster secret), like the redeem call.
pub async fn handle_shop_credits(env: Env, req: &Request) -> Result<Response> {
    let Some(token) = auth::bearer(req.headers()) else {
        return http::unauthorized();
    };
    let db = store::db(&env)?;
    let Some(shop) = store::shop_by_token(&db, &token).await? else {
        return http::unauthorized();
    };
    let tokens = shops::list_shop_tokens(&db, Some("used")).await?;
    let mine: Vec<&shops::ShopToken> = tokens
        .iter()
        .filter(|t| t.redeemed_by.as_deref() == Some(shop.id.as_str()))
        .collect();
    let from_codes: i64 = mine.iter().map(|t| t.credits).sum();
    // What the SHOP is told: the credits that reached it through the
    // codes it redeemed, and the codes themselves. The platform's
    // bookkeeping (the granted/used totals) stays on the admin side - a
    // shop does not read the platform's ledger.
    Response::from_json(&json!({
        "shop_id": shop.id,
        "from_codes": from_codes,
        "codes_redeemed": mine.len(),
        "codes": mine.iter().map(|t| json!({
            "code": t.code,
            "credits": t.credits,
            "redeemed_ms": t.redeemed_ms,
            "note": t.note,
        })).collect::<Vec<_>>(),
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
    match run_deploy(&env, &shop, &body.bundle_id, None).await {
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
    match run_deploy(&env, &shop, &body.bundle_id, None).await {
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
/// reused, so the shop keeps its data). `owner_token` carries the
/// studio token the owner chose; `None` mints a fresh one.
async fn run_deploy(
    env: &Env,
    shop: &shops::Shop,
    bundle_id: &str,
    owner_token: Option<String>,
) -> std::result::Result<DeployOutcome, String> {
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
        owner_token,
    };
    match crate::deployer::deploy_shop_with_source(env, source, &cfg, input).await {
        Ok(r) => Ok(DeployOutcome {
            shop_id: r.shop_id,
            url: r.custom_url,
        }),
        Err(e) => Err(e.to_string()),
    }
}
