/* routes/shop.rs - shop settings: env defaults, D1 overrides, owner save. */
use tryon_shared::models::ShopSettings;
use wasm_bindgen::JsValue;
use worker::{Env, FormEntry, HttpMetadata, Request, Response, Result};

/// Shop settings from env vars. D1 wins when an owner row exists.
pub fn from_env(env: &Env) -> ShopSettings {
    ShopSettings {
        shop_name: env
            .var("SHOP_NAME")
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "TryOn & Shop".into()),
        owner_whatsapp: env
            .var("OWNER_WHATSAPP")
            .map(|v| v.to_string())
            .unwrap_or_default(),
        currency: "USD".into(),
        logo_url: String::new(),
    }
}

/// Owner overrides from D1 win over env when the shop row exists.
pub async fn merged(env: &Env) -> ShopSettings {
    let mut shop = from_env(env);
    if let Ok(db) = env.d1("DB") {
        #[derive(serde::Deserialize)]
        struct ShopRow {
            #[serde(default)]
            shop_name: String,
            #[serde(default)]
            logo_url: String,
        }
        if let Ok(res) = db
            .prepare("SELECT shop_name,logo_url FROM shop WHERE id=1")
            .all()
            .await
        {
            if let Ok(mut rows) = res.results::<ShopRow>() {
                if let Some(row) = rows.pop() {
                    if !row.shop_name.is_empty() {
                        shop.shop_name = row.shop_name;
                    }
                    if !row.logo_url.is_empty() {
                        shop.logo_url = row.logo_url;
                    }
                }
            }
        }
    }
    shop
}

/// `GET /api/shop-settings`.
pub async fn handle_settings(env: Env) -> Result<Response> {
    Response::from_json(&merged(&env).await)
}

/// Owner shop card: Bearer-gated name + logo upload. Logo goes to R2
/// (`shop/logo.<ext>`); row id 1 upserted, missing fields keep old values.
pub async fn handle_save(mut req: Request, env: Env) -> Result<Response> {
    let expected = crate::routes::owner::env_token(&env);
    let auth = req
        .headers()
        .get("authorization")
        .map_err(|e| worker::Error::RustError(e.to_string()))?
        .unwrap_or_default();
    if !crate::routes::studio::authorized(Some(&auth), &expected) {
        return Response::error("unauthorized", 401);
    }
    let bucket = env
        .bucket("PRODUCTS")
        .map_err(|_| worker::Error::RustError("R2 PRODUCTS bucket not configured".into()))?;
    let db = env
        .d1("DB")
        .map_err(|_| worker::Error::RustError("D1 DB not configured".into()))?;
    let base = env
        .var("R2_PUBLIC_BASE")
        .map(|v| v.to_string())
        .unwrap_or_default();
    if base.is_empty() {
        return Response::error("R2_PUBLIC_BASE not configured", 500);
    }
    let form = req
        .form_data()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let mut shop = merged(&env).await;
    let name = form
        .get_field("shop_name")
        .unwrap_or_default()
        .trim()
        .to_string();
    if !name.is_empty() {
        shop.shop_name = name;
    }
    if let Some(FormEntry::File(f)) = form.get("logo") {
        let bytes = f
            .bytes()
            .await
            .map_err(|e| worker::Error::RustError(e.to_string()))?;
        if !bytes.is_empty() {
            crate::routes::person::check_file_part(&f.type_(), bytes.len())
                .map_err(|e| worker::Error::RustError(e.to_string()))?;
            let key = crate::routes::studio::shop_logo_key(&f.name());
            bucket
                .put(key.clone(), bytes)
                .http_metadata(HttpMetadata {
                    content_type: Some(f.type_()),
                    ..Default::default()
                })
                .execute()
                .await
                .map_err(|e| worker::Error::RustError(e.to_string()))?;
            shop.logo_url = crate::routes::studio::public_url(&base, &key);
        }
    }
    db.exec(SHOP_DDL)
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    db.prepare(
        "INSERT INTO shop (id,shop_name,logo_url) VALUES (1,?,?) \
         ON CONFLICT(id) DO UPDATE SET shop_name=excluded.shop_name,\
         logo_url=excluded.logo_url",
    )
    .bind(&[
        JsValue::from(shop.shop_name.clone()),
        JsValue::from(shop.logo_url.clone()),
    ])
    .map_err(|e| worker::Error::RustError(e.to_string()))?
    .run()
    .await
    .map_err(|e| worker::Error::RustError(e.to_string()))?;
    Response::from_json(&shop)
}

/// Owner-edited shop name + logo. Single row (id = 1); env vars stay the
/// fallback for fresh deploys.
pub const SHOP_DDL: &str = "CREATE TABLE IF NOT EXISTS shop (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    shop_name TEXT NOT NULL DEFAULT '',
    logo_url TEXT NOT NULL DEFAULT ''
)";
