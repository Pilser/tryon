use worker::{event, Context, Env, Request, Response, Result, Router};
use tryon_shared::models::{ProductFilter, ShopSettings, TryOnRequest};
use tryon_worker::{routes, ssr, store::MemoryStore};

fn shop_from_env(env: &Env) -> ShopSettings {
    ShopSettings {
        shop_name: env.var("SHOP_NAME").map(|v| v.to_string()).unwrap_or_else(|_| "TryOn Shop".into()),
        owner_whatsapp: env.var("OWNER_WHATSAPP").map(|v| v.to_string()).unwrap_or_default(),
        currency: "USD".into(),
        logo_url: String::new(),
    }
}

fn demo_products() -> Vec<tryon_shared::models::Product> {
    // v1 placeholder; replaced by D1 query in phase7.
    vec![]
}

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let router = Router::new();

    router
        .get_async("/", |_, ctx| async move {
            let shop = shop_from_env(ctx.env);
            let store = MemoryStore { products: demo_products(), shop: shop.clone() };
            let list = store.list(&ProductFilter::default());
            Response::from_html(ssr::render_landing(&shop, &list))
        })
        .get_async("/product/:id", |_, ctx| async move {
            let shop = shop_from_env(ctx.env);
            let id = ctx.param("id").cloned().unwrap_or_default();
            let store = MemoryStore { products: demo_products(), shop: shop.clone() };
            match store.get(&id) {
                Some(p) => Response::from_html(ssr::render_detail(&shop, &p)),
                None => Response::error("not found", 404),
            }
        })
        .get_async("/admin", |_, ctx| async move {
            let shop = shop_from_env(ctx.env);
            Response::from_html(ssr::render_admin(&shop))
        })
        .get_async("/api/products", |req, _ctx| async move {
            let q = req.url().map(|u| u.query().unwrap_or_default().to_string()).unwrap_or_default();
            let filter = routes::products::parse_filter(&q);
            let _ = filter;
            Response::from_json(&serde_json::json!([]))
        })
        .get_async("/api/shop-settings", |_, ctx| async move {
            Response::from_json(&shop_from_env(ctx.env))
        })
        .get("/healthz", |_, _| Response::from_json(&serde_json::json!({"ok": true})))
        .post_async("/api/try-on", |mut req, ctx| async move {
            let body: TryOnRequest = req.json().await.map_err(|e| worker::Error::RustError(e.to_string()))?;
            routes::tryon::validate(&body).map_err(|e| worker::Error::RustError(e.into()))?;
            let key = ctx.env.var("GENLOOK_API_KEY").map(|v| v.to_string()).unwrap_or_default();
            let client = tryon_worker::GenlookClient::new("https://api.genlook.app", &key)
                .map_err(|_| worker::Error::RustError("missing GENLOOK_API_KEY".into()))?;
            // v1: return path proof; phase7 does real `fetch` to Genlook here.
            Response::from_json(&serde_json::json!({
                "generation_id": "pending",
                "try_on_path": client.try_on_path(),
            }))
        })
        .run(req, env)
        .await
}
