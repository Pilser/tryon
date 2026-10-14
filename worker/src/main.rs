use serde::Deserialize;
use worker::{event, Context, Env, Fetch, Headers, Method, Request, RequestInit, Response, Result, Router};
use tryon_shared::models::{ProductFilter, ShopSettings, TryOnRequest};
use tryon_worker::{routes, ssr, store::MemoryStore};

const GENLOOK_BASE: &str = "https://api.genlook.app/tryon/v1";

fn shop_from_env(env: &Env) -> ShopSettings {
    ShopSettings {
        shop_name: env.var("SHOP_NAME").map(|v| v.to_string()).unwrap_or_else(|_| "TryOn Shop".into()),
        owner_whatsapp: env.var("OWNER_WHATSAPP").map(|v| v.to_string()).unwrap_or_default(),
        currency: "USD".into(),
        logo_url: String::new(),
    }
}

fn api_key(env: &Env) -> Result<String> {
    let k = env.var("GENLOOK_API_KEY").map(|v| v.to_string()).unwrap_or_default();
    if k.is_empty() {
        return Err(worker::Error::RustError("missing GENLOOK_API_KEY secret".into()));
    }
    Ok(k)
}

fn origin_of(req: &Request) -> String {
    req.url()
        .map(|u| format!("{}://{}", u.scheme(), u.host_str().unwrap_or_default()))
        .unwrap_or_default()
}

fn demo_products() -> Vec<tryon_shared::models::Product> {
    // v1 placeholder; replaced by D1 query in phase7.
    vec![]
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
    let input: SyncIn = req.json().await.map_err(|e| worker::Error::RustError(e.to_string()))?;
    routes::tryon::validate(&TryOnRequest {
        product_id: input.product_id.clone(),
        person_image_id: input.person_image_id.clone(),
    })
    .map_err(|e| worker::Error::RustError(e.into()))?;
    let body = routes::tryon::build_sync_body(
        &input.product_id,
        &input.title,
        &input.description,
        &input.image_url,
        &input.person_image_id,
    );
    let bytes = serde_json::to_vec(&body).map_err(|e| worker::Error::RustError(e.to_string()))?;
    // `/try-on/sync` waits up to 90 s and returns 200 (COMPLETED +
    // temporary `resultImageUrl`) or 202 (poll `/api/generations/:id`).
    forward_genlook(&key, Method::Post, &format!("{GENLOOK_BASE}/try-on/sync"), Some("application/json"), Some(bytes))
        .await
}

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let router = Router::new();

    router
        .get_async("/", |req, ctx| async move {
            let origin = origin_of(&req);
            let shop = shop_from_env(&ctx.env);
            let store = MemoryStore { products: demo_products(), shop: shop.clone() };
            let list = store.list(&ProductFilter::default());
            Response::from_html(ssr::render_landing(&shop, &list, &origin))
        })
        .get_async("/product/:id", |req, ctx| async move {
            let origin = origin_of(&req);
            let shop = shop_from_env(&ctx.env);
            let id = ctx.param("id").cloned().unwrap_or_default();
            let store = MemoryStore { products: demo_products(), shop: shop.clone() };
            match store.get(&id) {
                Some(p) => Response::from_html(ssr::render_detail(&shop, &p, &origin)),
                None => Response::error("not found", 404),
            }
        })
        .get_async("/admin", |req, ctx| async move {
            let origin = origin_of(&req);
            let shop = shop_from_env(&ctx.env);
            Response::from_html(ssr::render_admin(&shop, &origin))
        })
        .get_async("/api/products", |req, _ctx| async move {
            let q = req.url().map(|u| u.query().unwrap_or_default().to_string()).unwrap_or_default();
            let filter = routes::products::parse_filter(&q);
            let _ = filter;
            Response::from_json(&serde_json::json!([]))
        })
        .get_async("/api/shop-settings", |_, ctx| async move {
            Response::from_json(&shop_from_env(&ctx.env))
        })
        .get("/healthz", |_, _| Response::from_json(&serde_json::json!({"ok": true})))
        .post_async("/api/person-upload", |mut req, ctx| async move {
            let key = api_key(&ctx.env)?;
            let ct = req.headers().get("content-type")?.unwrap_or_default();
            let len = req
                .headers()
                .get("content-length")?
                .and_then(|v| v.parse::<usize>().ok());
            routes::person::precheck(len, if ct.is_empty() { None } else { Some(ct.as_str()) })
                .map_err(|e| worker::Error::RustError(e.into()))?;
            let bytes = req.bytes().await.map_err(|e| worker::Error::RustError(e.to_string()))?;
            if bytes.len() > tryon_shared::photo::MAX_BYTES {
                return Response::error("upload over 10 MB", 400);
            }
            // Raw multipart forwarded untouched (boundary preserved via
            // content-type). `keepForDays` / `externalUserId` fields ride along.
            forward_genlook(&key, Method::Post, &format!("{GENLOOK_BASE}/images/upload"), Some(&ct), Some(bytes))
                .await
        })
        .post_async("/api/try-on/sync", |req, ctx| async move {
            handle_tryon_sync(req, ctx.env).await
        })
        .post_async("/api/try-on", |req, ctx| async move {
            handle_tryon_sync(req, ctx.env).await
        })
        .get_async("/api/generations/:id", |_, ctx| async move {
            let key = api_key(&ctx.env)?;
            let id = ctx.param("id").cloned().unwrap_or_default();
            forward_genlook(&key, Method::Get, &format!("{GENLOOK_BASE}/generations/{id}"), None, None).await
        })
        .run(req, env)
        .await
}
