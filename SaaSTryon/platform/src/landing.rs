/* landing.rs - Phase G: the customer's own landing page for a deployed
shop.

   The shop's static surface is served by the shop script's ASSETS
   binding, so a landing page is just more assets: the customer uploads
   their `dist` here, the platform stores it in R2 and re-registers the
   shop's asset manifest with

     /            -> the customer's landing files (dist/index.html …)
     /app/…       -> the shop app (unchanged, from the bundle)

   Cloudflare only transfers the files it does not have yet, so a
   re-upload costs the new files alone, and the assets are served from
   the edge cache (hashed names + the `_headers` rules).

   Files are uploaded one by one (`POST /api/v1/shop/landing/file`) and
   published with `POST /api/v1/shop/landing/apply` - the apply step is
   what re-PUTs the script with the new asset set. */
use serde::Deserialize;
use serde_json::json;
use worker::{Env, FormEntry, Request, Response, Result};

use crate::deployer::bundle::{BundleSource, MultipartBuilder, R2BundleSource};
use crate::deployer::cf_api::{call_with_retry, CfBody, CfConfig, CfError, CfRequest, Transport};
use crate::deployer::{bindings_for, d1_name, ScriptPut};
use crate::{auth, http, shops, store};

/// Where the customer's landing files live in the BUNDLES bucket.
pub const LANDING_PREFIX: &str = "landings";

#[derive(Deserialize)]
pub struct PathIn {
    pub path: String,
}

/// Which shop to publish (the newest one when omitted).
#[derive(Deserialize, Default)]
pub struct ApplyIn {
    #[serde(default)]
    pub shop_id: Option<String>,
}

/// A query parameter of the request.
fn query_param(req: &Request, name: &str) -> Option<String> {
    req.url()
        .ok()
        .and_then(|u| {
            u.query_pairs()
                .find(|(k, _)| k == name)
                .map(|(_, v)| v.into_owned())
        })
        .filter(|v| !v.is_empty())
}

/// Pure: the asset path of a landing file (tested). The customer's
/// dist root maps to "/", everything else keeps its path.
pub fn landing_path(raw: &str) -> Option<String> {
    let p = raw.trim().trim_start_matches('/');
    if p.is_empty() {
        return Some("/index.html".into());
    }
    if p.contains("..") || p.contains("//") || p.len() > 200 {
        return None;
    }
    let ok = |c: char| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '/');
    if !p.chars().all(ok) {
        return None;
    }
    Some(format!("/{p}"))
}

/// The landing files of a shop, as (path, bytes) - read from R2.
async fn landing_files(bucket: &worker::Bucket, shop_id: &str) -> Result<Vec<(String, Vec<u8>)>> {
    let mut out = Vec::new();
    let manifest_key = format!("{LANDING_PREFIX}/{shop_id}/manifest.json");
    let Some(raw) = read_object(bucket, &manifest_key).await? else {
        return Ok(out);
    };
    let raw = String::from_utf8(raw)
        .map_err(|e| worker::Error::RustError(format!("landing manifest: {e}")))?;
    let manifest: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| worker::Error::RustError(format!("landing manifest: {e}")))?;
    let Some(files) = manifest.get("files").and_then(|f| f.as_array()) else {
        return Ok(out);
    };
    for f in files {
        let Some(path) = f.get("path").and_then(|p| p.as_str()) else {
            continue;
        };
        let key = format!("{LANDING_PREFIX}/{shop_id}/files{}", path);
        if let Some(bytes) = read_object(bucket, &key).await? {
            out.push((path.to_string(), bytes));
        }
    }
    Ok(out)
}

/// One object from R2 (None when the key is missing).
async fn read_object(bucket: &worker::Bucket, key: &str) -> Result<Option<Vec<u8>>> {
    match bucket.get(key).execute().await {
        Err(e) => Err(worker::Error::RustError(format!("{key}: {e}"))),
        Ok(None) => Ok(None),
        Ok(Some(obj)) => {
            let Some(body) = obj.body() else {
                return Err(worker::Error::RustError(format!("{key} has no body")));
            };
            let bytes = body
                .bytes()
                .await
                .map_err(|e| worker::Error::RustError(format!("{key}: {e}")))?;
            Ok(Some(bytes.to_vec()))
        }
    }
}

/// `POST /api/v1/shop/landing/file?path=/index.html` (multipart) - store
/// one file of the customer's dist.
pub async fn handle_upload(env: Env, mut req: Request) -> Result<Response> {
    let db = store::db(&env)?;
    let Some(session) = auth::verify_session(&db, req.headers()).await? else {
        return http::unauthorized();
    };
    let Some(shop) = shops::owned_shop(
        &db,
        &session.user_id,
        query_param(&req, "shop_id").as_deref(),
    )
    .await?
    else {
        return http::json_error(404, "NO_SHOP", "deploy a shop first");
    };
    let bucket = env
        .bucket("BUNDLES")
        .map_err(|_| worker::Error::RustError("R2 BUNDLES binding not configured".into()))?;

    // The path travels as a query parameter (the multipart file name is
    // the browser's name, which may be a full path).
    let raw = req
        .url()
        .ok()
        .and_then(|u| {
            u.query_pairs()
                .find(|(k, _)| k == "path")
                .map(|(_, v)| v.into_owned())
        })
        .unwrap_or_default();
    let Some(path) = landing_path(&raw) else {
        return http::bad_request("BAD_PATH", "that file path is not allowed");
    };

    let form = req
        .form_data()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let Some(FormEntry::File(file)) = form.get("file") else {
        return http::bad_request("NO_FILE", "expected a file part named 'file'");
    };
    let bytes = file
        .bytes()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    if bytes.len() > 5 * 1024 * 1024 {
        return http::bad_request("TOO_BIG", "one landing file may be 5 MB");
    }
    let key = format!("{LANDING_PREFIX}/{}/files{path}", shop.id);
    bucket
        .put(&key, bytes)
        .execute()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;

    // Keep the landing manifest in sync (path -> key).
    let mut files: Vec<serde_json::Value> = Vec::new();
    let manifest_key = format!("{LANDING_PREFIX}/{}/manifest.json", shop.id);
    if let Some(raw) = read_object(&bucket, &manifest_key).await? {
        if let Ok(text) = String::from_utf8(raw) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(arr) = v.get("files").and_then(|f| f.as_array()) {
                    files = arr.clone();
                }
            }
        }
    }
    files.retain(|f| f.get("path").and_then(|p| p.as_str()) != Some(path.as_str()));
    files.push(json!({ "path": path, "key": key }));
    bucket
        .put(
            &manifest_key,
            serde_json::to_vec(&json!({ "files": files }))
                .map_err(|e| worker::Error::RustError(e.to_string()))?,
        )
        .execute()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;

    Response::from_json(&json!({ "ok": true, "path": path, "files": files.len() }))
}

/// The landing files of a shop (their paths) - the dashboard shows
/// them so the owner sees what is published.
pub async fn landing_paths(env: &Env, shop_id: &str) -> Result<Vec<String>> {
    let bucket = env
        .bucket("BUNDLES")
        .map_err(|_| worker::Error::RustError("R2 BUNDLES binding not configured".into()))?;
    let files = landing_files(&bucket, shop_id).await?;
    Ok(files.into_iter().map(|(p, _)| p).collect())
}

/// `GET /api/v1/shop/landing` - what is published now.
pub async fn handle_list(env: Env, req: &Request) -> Result<Response> {
    let db = store::db(&env)?;
    let Some(session) = auth::verify_session(&db, req.headers()).await? else {
        return http::unauthorized();
    };
    let bucket = env
        .bucket("BUNDLES")
        .map_err(|_| worker::Error::RustError("R2 BUNDLES binding not configured".into()))?;
    // Every shop of the owner, so the dashboard can show them all.
    let mut shops_out = Vec::new();
    for shop in shops::shops_of_owner(&db, &session.user_id).await? {
        let files = landing_files(&bucket, &shop.id).await?;
        shops_out.push(json!({
            "shop_id": shop.id,
            "subdomain": shop.subdomain,
            "url": format!("https://{}.latiforge.com", shop.subdomain),
            "files": files.iter().map(|(p, _)| p).collect::<Vec<_>>(),
        }));
    }
    Response::from_json(&json!({ "ok": true, "shops": shops_out }))
}

/// `POST /api/v1/shop/landing/apply` - publish: re-register the shop's
/// assets (app + landing) and re-PUT the script with the new set.
pub async fn handle_apply(env: Env, req: &mut Request) -> Result<Response> {
    let db = store::db(&env)?;
    let Some(session) = auth::verify_session(&db, req.headers()).await? else {
        return http::unauthorized();
    };
    let Some(body) = http::json_body::<ApplyIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {shop_id?}");
    };
    let Some(shop) = shops::owned_shop(&db, &session.user_id, body.shop_id.as_deref()).await?
    else {
        return http::json_error(404, "NO_SHOP", "deploy a shop first");
    };
    let bucket = env
        .bucket("BUNDLES")
        .map_err(|_| worker::Error::RustError("R2 BUNDLES binding not configured".into()))?;
    let cfg = match CfConfig::from_env(&env) {
        Ok(c) => c,
        Err(e) => return http::json_error(500, "NO_CF", &e),
    };
    let transport = crate::deployer::cf_api::FetchTransport::new(cfg.clone());

    // The landing files first (they only need a borrow), then the bundle
    // (which takes the bucket).
    let landing = match landing_files(&bucket, &shop.id).await {
        Ok(f) => f,
        Err(e) => return http::json_error(500, "LANDING", &e.to_string()),
    };
    if landing.is_empty() {
        return http::json_error(400, "NO_FILES", "upload a landing file first");
    }
    let landing_count = landing.len();
    // The app assets (bundle) + the landing files.
    let bundle = match (R2BundleSource { bucket })
        .load_bundle(&shop.depot_version)
        .await
    {
        Ok(b) => b,
        Err(e) => return http::json_error(500, "NO_BUNDLE", &e),
    };
    let mut assets = bundle.assets.clone();
    assets.extend(landing);

    // The per-shop D1 (found by its provisioned name) and the token the
    // shop already uses - the landing update must not break its calls.
    let id8 = shop
        .cluster_id
        .strip_prefix("shop-")
        .unwrap_or(&shop.cluster_id)
        .to_string();
    let d1_uuid = find_d1(&transport, &cfg.account, &d1_name(&id8))
        .await?
        .ok_or_else(|| worker::Error::RustError("per-shop database not found".into()))?;
    let token = shop
        .platform_token
        .clone()
        .filter(|t| !t.is_empty())
        .ok_or_else(|| worker::Error::RustError("shop has no platform token".into()))?;

    let mp = MultipartBuilder::new();
    let staged = match crate::deployer::bundle::stage_asset_set(
        &transport,
        &cfg.account,
        &shop.cluster_id,
        &assets,
        &mp,
    )
    .await
    {
        Ok(s) => s,
        Err(e) => return http::json_error(502, "ASSETS", &e.to_string()),
    };

    let bindings = bindings_for(
        &id8,
        &d1_uuid,
        &token,
        &shop
            .owner_token
            .clone()
            .ok_or_else(|| worker::Error::RustError("shop has no owner token".into()))?,
        &crate::deployer::public_base(&format!("{}.{}", shop.subdomain, cfg.zone_name)),
        &format!("https://{}", cfg.zone_name),
    );
    let put = ScriptPut {
        account: &cfg.account,
        script_name: &shop.cluster_id,
        main_module: &bundle.manifest.entry,
        compat_date: &bundle.manifest.compat_date,
        bindings: &bindings,
        assets_jwt: Some(&staged.completion_jwt),
        wasm_name: &bundle.manifest.wasm_name(),
        wasm: &bundle.wasm,
        glue: &bundle.glue,
    };
    if let Err(e) = call_with_retry(&transport, put.request(&mp)).await {
        return http::json_error(502, "CF_FAILED", &e.to_string());
    }

    store::append_audit(
        &db,
        &shop.id,
        "landing.apply",
        &shop.cluster_id,
        &format!("{} files", landing_count),
        auth::now_ms(),
    )
    .await?;
    Response::from_json(&json!({
        "ok": true,
        "files": landing_count,
        "uploaded": staged.uploaded_parts,
        "url": format!("https://{}.latiforge.com", shop.subdomain),
    }))
}

/// The uuid of the per-shop D1, found by its name.
async fn find_d1(
    cf: &impl Transport,
    account: &str,
    name: &str,
) -> std::result::Result<Option<String>, CfError> {
    let v = call_with_retry(
        cf,
        CfRequest {
            method: worker::Method::Get,
            path: format!("/accounts/{account}/d1/database?per_page=100"),
            body: CfBody::Empty,
            jwt: None,
        },
    )
    .await?;
    let list = crate::deployer::cf_api::result_of(&v);
    for db in list.as_array().cloned().unwrap_or_default() {
        if db.get("name").and_then(|n| n.as_str()) == Some(name) {
            if let Some(uuid) = db.get("uuid").and_then(|u| u.as_str()) {
                return Ok(Some(uuid.to_string()));
            }
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn landing_paths_are_sanitised() {
        assert_eq!(landing_path("/").as_deref(), Some("/index.html"));
        assert_eq!(landing_path("").as_deref(), Some("/index.html"));
        assert_eq!(landing_path("/about.html").as_deref(), Some("/about.html"));
        assert_eq!(
            landing_path("/assets/app.css").as_deref(),
            Some("/assets/app.css")
        );
        assert!(landing_path("/../etc/passwd").is_none());
        assert!(landing_path("/a//b").is_none());
        assert!(landing_path("/a b").is_none());
    }
}
