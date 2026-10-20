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
        currency: tryon_shared::currency::normalize(
            &env.var("SHOP_CURRENCY")
                .map(|v| v.to_string())
                .unwrap_or_default(),
            tryon_shared::currency::DEFAULT,
        ),
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
            #[serde(default)]
            currency: String,
            #[serde(default)]
            owner_whatsapp: String,
        }
        if let Ok(res) = db
            .prepare("SELECT shop_name,logo_url,currency,owner_whatsapp FROM shop WHERE id=1")
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
                    if tryon_shared::currency::is_supported(&row.currency) {
                        shop.currency = tryon_shared::currency::clean(&row.currency);
                    }
                    if !row.owner_whatsapp.is_empty() {
                        shop.owner_whatsapp = row.owner_whatsapp;
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
        return crate::routes::errors::unauthorized();
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
        return crate::routes::errors::not_configured("R2_PUBLIC_BASE missing");
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
    let wa = form
        .get_field("owner_whatsapp")
        .unwrap_or_default()
        .trim()
        .to_string();
    if !wa.is_empty() || form.get_field("owner_whatsapp").is_some() {
        // An explicit (even empty) field means "set it"; digits only, like
        // the env var (`254712345678`, no `+`).
        shop.owner_whatsapp = wa.chars().filter(|c| c.is_ascii_digit()).collect();
    }
    let cur = form.get_field("currency").unwrap_or_default();
    if tryon_shared::currency::is_supported(&cur) {
        shop.currency = tryon_shared::currency::clean(&cur);
    }
    if let Some(FormEntry::File(f)) = form.get("logo") {
        let bytes = f
            .bytes()
            .await
            .map_err(|e| worker::Error::RustError(e.to_string()))?;
        if !bytes.is_empty() {
            crate::routes::person::check_file_part(&f.type_(), bytes.len())
                .map_err(|e| worker::Error::RustError(e.to_string()))?;
            let key = crate::tenant::apply_prefix(
                &crate::tenant::r2_prefix(&env),
                &crate::routes::studio::shop_logo_key(&f.name()),
            );
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
    crate::store::exec_one(&db, SHOP_DDL)
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    // Older rows predate currency/WhatsApp: add the columns in place.
    for sql in SHOP_MIGRATIONS {
        let _ = crate::store::exec_one(&db, sql).await;
    }
    db.prepare(
        "INSERT INTO shop (id,shop_name,logo_url,currency,owner_whatsapp) \
         VALUES (1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET \
         shop_name=excluded.shop_name,logo_url=excluded.logo_url,\
         currency=excluded.currency,owner_whatsapp=excluded.owner_whatsapp",
    )
    .bind(&[
        JsValue::from(shop.shop_name.clone()),
        JsValue::from(shop.logo_url.clone()),
        JsValue::from(shop.currency.clone()),
        JsValue::from(shop.owner_whatsapp.clone()),
    ])
    .map_err(|e| worker::Error::RustError(e.to_string()))?
    .run()
    .await
    .map_err(|e| worker::Error::RustError(e.to_string()))?;
    Response::from_json(&shop)
}

/// Owner-edited shop name + logo. Single row (id = 1); env vars stay the
/// fallback for fresh deploys. `currency` (shop default, UGX) and
/// `owner_whatsapp` (Inquire + unlock contact) live on the same row.
pub const SHOP_DDL: &str = "CREATE TABLE IF NOT EXISTS shop (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    shop_name TEXT NOT NULL DEFAULT '',
    logo_url TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT '',
    owner_whatsapp TEXT NOT NULL DEFAULT ''
)";

/// `CREATE TABLE IF NOT EXISTS` cannot add columns to an existing table,
/// so older deploys get them here (errors are ignored: already present).
pub const SHOP_MIGRATIONS: [&str; 2] = [
    "ALTER TABLE shop ADD COLUMN currency TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE shop ADD COLUMN owner_whatsapp TEXT NOT NULL DEFAULT ''",
];
