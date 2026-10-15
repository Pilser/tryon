pub mod genlook;
pub mod routes;
pub mod store;

pub use genlook::{GenlookClient, GenlookError};
pub use store::{ProductStore, ShopStore};

use crate::store::MemoryStore;
use serde::Deserialize;
use tryon_shared::models::{ShopSettings, TryOnRequest};
use wasm_bindgen::JsValue;
use worker::{
    event, Context, Env, Fetch, FormEntry, Headers, HttpMetadata, Method, Request, RequestInit,
    Response, Result, Router,
};

const GENLOOK_BASE: &str = "https://api.genlook.app/tryon/v1";

fn shop_from_env(env: &Env) -> ShopSettings {
    ShopSettings {
        shop_name: env
            .var("SHOP_NAME")
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "TryOn Shop".into()),
        owner_whatsapp: env
            .var("OWNER_WHATSAPP")
            .map(|v| v.to_string())
            .unwrap_or_default(),
        currency: "USD".into(),
        logo_url: String::new(),
    }
}

fn api_key(env: &Env) -> Result<String> {
    let k = env
        .var("GENLOOK_API_KEY")
        .map(|v| v.to_string())
        .unwrap_or_default();
    if k.is_empty() {
        return Err(worker::Error::RustError(
            "missing GENLOOK_API_KEY secret".into(),
        ));
    }
    Ok(k)
}

fn moved(to: &str) -> Result<Response> {
    let mut headers = Headers::new();
    headers.set("location", to)?;
    Ok(Response::empty()?.with_status(302).with_headers(headers))
}

/// Local-test + edge seed: JSON array of products in `PRODUCTS_JSON`.
/// Replaced by the D1 query in phase7; same struct, same code paths.
fn seed_products(env: &Env) -> Vec<tryon_shared::models::Product> {
    env.var("PRODUCTS_JSON")
        .map(|v| v.to_string())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Forward a call to Genlook, passing the JSON body through so the client
/// sees the real `generationId` / `resultImageUrl` / error `code`.
async fn forward_genlook(
    key: &str,
    method: Method,
    url: &str,
    content_type: Option<&str>,
    body: Option<Vec<u8>>,
) -> Result<Response> {
    let mut headers = Headers::new();
    headers.set("x-api-key", key)?;
    if let Some(ct) = content_type {
        headers.set("content-type", ct)?;
    }
    let mut init = RequestInit::new();
    init.with_method(method);
    init.with_headers(headers);
    if let Some(b) = body {
        init.with_body(Some(js_sys::Uint8Array::from(b.as_slice()).into()));
    }
    let out = Request::new_with_init(url, &init)?;
    let mut upstream = Fetch::Request(out).send().await?;
    let status = upstream.status_code();
    let text = upstream.text().await?;
    if (200..300).contains(&status) {
        let v: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| worker::Error::RustError(e.to_string()))?;
        Response::from_json(&v)
    } else {
        let short: String = text.chars().take(300).collect();
        Response::error(short, status)
    }
}

/// Client sends the product snapshot (already validated against D1 in
/// phase7) + the person `imageId` from `/api/person-upload`.
#[derive(Deserialize)]
struct SyncIn {
    product_id: String,
    title: String,
    description: String,
    image_url: String,
    person_image_id: String,
}

async fn handle_tryon_sync(mut req: Request, env: Env) -> Result<Response> {
    let key = api_key(&env)?;
    let input: SyncIn = req
        .json()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    crate::routes::tryon::validate(&TryOnRequest {
        product_id: input.product_id.clone(),
        person_image_id: input.person_image_id.clone(),
    })
    .map_err(|e| worker::Error::RustError(e.into()))?;
    let body = crate::routes::tryon::build_sync_body(
        &input.product_id,
        &input.title,
        &input.description,
        &input.image_url,
        &input.person_image_id,
    );
    let bytes = serde_json::to_vec(&body).map_err(|e| worker::Error::RustError(e.to_string()))?;
    // `/try-on/sync` waits up to 90 s and returns 200 (COMPLETED +
    // temporary `resultImageUrl`) or 202 (poll `/api/generations/:id`).
    forward_genlook(
        &key,
        Method::Post,
        &format!("{GENLOOK_BASE}/try-on/sync"),
        Some("application/json"),
        Some(bytes),
    )
    .await
}

fn admin_token(env: &Env) -> String {
    env.var("ADMIN_TOKEN")
        .map(|v| v.to_string())
        .unwrap_or_default()
}

async fn handle_owner_login(mut req: Request, env: Env) -> Result<Response> {
    let input: crate::routes::owner::LoginIn = req
        .json()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    if crate::routes::owner::login_ok(input.token.trim(), &admin_token(&env)) {
        Response::from_json(&crate::routes::owner::LoginOut { ok: true })
    } else {
        Response::error("bad token", 401)
    }
}

async fn handle_owner_logout() -> Result<Response> {
    // Stateless auth: the browser holds the token, logout clears it there.
    Response::from_json(&crate::routes::owner::LoginOut { ok: true })
}

/// Row shape for D1 reads (`sizes` stays CSV in the table, split on read).
#[derive(Deserialize)]
struct ProductRow {
    #[serde(default)]
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    price_cents: u32,
    #[serde(default)]
    currency: String,
    #[serde(default)]
    image_url: String,
    #[serde(default)]
    model_image_url: String,
    #[serde(default)]
    styled_image_url: String,
    #[serde(default)]
    r2_key: String,
    #[serde(default)]
    category: String,
    #[serde(default)]
    sizes: String,
    #[serde(default)]
    created_at: String,
}

fn row_to_product(r: ProductRow) -> tryon_shared::models::Product {
    tryon_shared::models::Product {
        sizes: r
            .sizes
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect(),
        currency: if r.currency.is_empty() {
            "USD".into()
        } else {
            r.currency
        },
        id: r.id,
        title: r.title,
        description: r.description,
        price_cents: r.price_cents,
        image_url: r.image_url,
        model_image_url: r.model_image_url,
        styled_image_url: r.styled_image_url,
        r2_key: r.r2_key,
        category: r.category,
        created_at: r.created_at,
    }
}

/// Owner-added products from D1. `Err` (no binding yet) means the caller
/// falls back to the `PRODUCTS_JSON` seed.
async fn d1_products(env: &Env) -> Result<Vec<tryon_shared::models::Product>> {
    let db = env.d1("DB")?;
    let res = db
        .prepare(
            "SELECT id,title,description,price_cents,currency,image_url,\
             model_image_url,styled_image_url,r2_key,category,sizes,created_at \
             FROM products ORDER BY created_at DESC",
        )
        .all()
        .await?;
    Ok(res
        .results::<ProductRow>()?
        .into_iter()
        .map(row_to_product)
        .collect())
}

fn new_product_id() -> String {
    let ms = js_sys::Date::now() as u64;
    let rnd = (js_sys::Math::random() * 16777215.0) as u64;
    format!("p{ms:x}{rnd:x}")
}

/// Owner bundle upload: Bearer-gated, files to R2 (`products/<id>-<slot>.<ext>`
/// with content type), row into D1, full `Product` JSON back. Garment
/// (`image0`) is required; model/styled may follow later (styled can even
/// be generated from a try-on result in the studio).
async fn handle_admin_create(mut req: Request, env: Env) -> Result<Response> {
    let expected = admin_token(&env);
    let auth = req
        .headers()
        .get("authorization")
        .map_err(|e| worker::Error::RustError(e.to_string()))?
        .unwrap_or_default();
    if !crate::routes::admin::authorized(Some(&auth), &expected) {
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
    let text = crate::routes::admin::parse_text(
        &form.get_field("title").unwrap_or_default(),
        &form.get_field("description").unwrap_or_default(),
        &form.get_field("price_cents").unwrap_or_default(),
        &form.get_field("category").unwrap_or_default(),
        &form.get_field("sizes").unwrap_or_default(),
    )
    .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let id = new_product_id();
    let mut urls = [String::new(), String::new(), String::new()];
    let mut first_key = String::new();
    for (i, (slot, field)) in [
        ("garment", "image0"),
        ("model", "image1"),
        ("styled", "image2"),
    ]
    .iter()
    .enumerate()
    {
        if let Some(FormEntry::File(f)) = form.get(field) {
            let bytes = f
                .bytes()
                .await
                .map_err(|e| worker::Error::RustError(e.to_string()))?;
            if bytes.is_empty() {
                continue;
            }
            crate::routes::person::check_file_part(&f.type_(), bytes.len())
                .map_err(|e| worker::Error::RustError(e.to_string()))?;
            let key = crate::routes::admin::slot_key(&id, slot, &f.name());
            bucket
                .put(key.clone(), bytes)
                .http_metadata(HttpMetadata {
                    content_type: Some(f.type_()),
                    ..Default::default()
                })
                .execute()
                .await
                .map_err(|e| worker::Error::RustError(e.to_string()))?;
            if first_key.is_empty() {
                first_key = key.clone();
            }
            urls[i] = crate::routes::admin::public_url(&base, &key);
        }
    }
    if urls[0].is_empty() {
        return Response::error("garment photo (image0) required", 400);
    }
    let created = format!("{}", js_sys::Date::now() as u64);
    let sizes_csv = text.sizes.join(",");
    db.exec(crate::routes::admin::PRODUCTS_DDL)
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    db.prepare(
        "INSERT INTO products (id,title,description,price_cents,currency,image_url,\
         model_image_url,styled_image_url,r2_key,category,sizes,created_at) \
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(&[
        JsValue::from(id.clone()),
        JsValue::from(text.title.clone()),
        JsValue::from(text.description.clone()),
        JsValue::from(text.price_cents),
        JsValue::from("USD".to_string()),
        JsValue::from(urls[0].clone()),
        JsValue::from(urls[1].clone()),
        JsValue::from(urls[2].clone()),
        JsValue::from(first_key.clone()),
        JsValue::from(text.category.clone()),
        JsValue::from(sizes_csv),
        JsValue::from(created.clone()),
    ])
    .map_err(|e| worker::Error::RustError(e.to_string()))?
    .run()
    .await
    .map_err(|e| worker::Error::RustError(e.to_string()))?;
    Response::from_json(&tryon_shared::models::Product {
        id,
        title: text.title,
        description: text.description,
        price_cents: text.price_cents,
        currency: "USD".into(),
        image_url: urls[0].clone(),
        model_image_url: urls[1].clone(),
        styled_image_url: urls[2].clone(),
        r2_key: first_key,
        category: text.category,
        sizes: text.sizes,
        created_at: created,
    })
}

#[event(fetch)]
async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let router = Router::new();

    router
        // UI lives in frontend/ (TypeScript + StyleX, served as static
        // assets). These redirects keep old links working; no HTML here.
        .get("/", |_, _| moved("/app/"))
        .get_async("/product/:id", |_, ctx| async move {
            let id = ctx.param("id").cloned().unwrap_or_default();
            moved(&format!("/app/product.html?id={id}"))
        })
        .get("/admin", |_, _| moved("/app/studio.html?owner=1"))
        .get_async("/api/products", |req, ctx| async move {
            let q = req
                .url()
                .map(|u| u.query().unwrap_or_default().to_string())
                .unwrap_or_default();
            let filter = crate::routes::products::parse_filter(&q);
            let shop = shop_from_env(&ctx.env);
            // D1 first (owner uploads), seed fallback for local dev.
            let products = d1_products(&ctx.env)
                .await
                .unwrap_or_else(|_| seed_products(&ctx.env));
            let store = MemoryStore { products, shop };
            Response::from_json(&store.list(&filter))
        })
        .get_async("/api/products/:id", |_, ctx| async move {
            let shop = shop_from_env(&ctx.env);
            let id = ctx.param("id").cloned().unwrap_or_default();
            let products = d1_products(&ctx.env)
                .await
                .unwrap_or_else(|_| seed_products(&ctx.env));
            let store = MemoryStore { products, shop };
            match store.get(&id) {
                Some(p) => Response::from_json(&p),
                None => Response::error("not found", 404),
            }
        })
        .get_async("/api/shop-settings", |_, ctx| async move {
            Response::from_json(&shop_from_env(&ctx.env))
        })
        .get("/healthz", |_, _| {
            Response::from_json(&serde_json::json!({"ok": true}))
        })
        .post_async("/api/person-upload", |mut req, ctx| async move {
            let key = api_key(&ctx.env)?;
            let ct = req.headers().get("content-type")?.unwrap_or_default();
            let len = req
                .headers()
                .get("content-length")?
                .and_then(|v| v.parse::<usize>().ok());
            crate::routes::person::precheck(
                len,
                if ct.is_empty() {
                    None
                } else {
                    Some(ct.as_str())
                },
            )
            .map_err(|e| worker::Error::RustError(e.into()))?;
            let bytes = req
                .bytes()
                .await
                .map_err(|e| worker::Error::RustError(e.to_string()))?;
            if bytes.len() > tryon_shared::photo::MAX_BYTES {
                return Response::error("upload over 10 MB", 400);
            }
            // Raw multipart forwarded untouched (boundary preserved via
            // content-type). `keepForDays` / `externalUserId` fields ride along.
            forward_genlook(
                &key,
                Method::Post,
                &format!("{GENLOOK_BASE}/images/upload"),
                Some(&ct),
                Some(bytes),
            )
            .await
        })
        .post_async("/api/try-on/sync", |req, ctx| async move {
            handle_tryon_sync(req, ctx.env).await
        })
        .post_async("/api/try-on", |req, ctx| async move {
            handle_tryon_sync(req, ctx.env).await
        })
        .post_async("/api/owner/login", |req, ctx| async move {
            handle_owner_login(req, ctx.env).await
        })
        .post_async("/api/owner/logout", |_, _| async move {
            handle_owner_logout().await
        })
        .post_async("/api/admin/products", |req, ctx| async move {
            handle_admin_create(req, ctx.env).await
        })
        .get_async("/api/generations/:id", |_, ctx| async move {
            let key = api_key(&ctx.env)?;
            let id = ctx.param("id").cloned().unwrap_or_default();
            forward_genlook(
                &key,
                Method::Get,
                &format!("{GENLOOK_BASE}/generations/{id}"),
                None,
                None,
            )
            .await
        })
        .run(req, env)
        .await
}
