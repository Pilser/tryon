/* lib.rs - the Worker entrypoint: routing only. Rendering lives in
`frontend/` (TypeScript + StyleX served as static assets), domain logic
in the routes modules, storage in `store.rs` and `routes/genlook_api.rs`. */
pub mod genlook;
pub mod routes;
pub mod store;

pub use genlook::{GenlookClient, GenlookError};
pub use store::{ProductStore, ShopStore};

use worker::{event, Context, Env, Headers, Request, Response, Result, Router};

/// Temporary 302 handing old links to the frontend pages.
fn moved(to: &str) -> Result<Response> {
    let mut headers = Headers::new();
    headers.set("location", to)?;
    Ok(Response::empty()?.with_status(302).with_headers(headers))
}

#[event(fetch)]
async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let router = Router::new();

    router
        // The UI is static (frontend/). These redirects keep old links
        // working; no HTML or CSS is generated here.
        .get("/", |_, _| moved("/app/"))
        .get_async("/product/:id", |_, ctx| async move {
            let id = ctx.param("id").cloned().unwrap_or_default();
            moved(&format!("/app/product.html?id={id}"))
        })
        .get("/studio", |_, _| moved("/app/studio.html?owner=1"))
        .get("/healthz", |_, _| routes::health::response())
        // Catalogue
        .get_async("/api/products", |req, ctx| async move {
            let q = req
                .url()
                .map(|u| u.query().unwrap_or_default().to_string())
                .unwrap_or_default();
            routes::products::handle_list(&q, &ctx.env).await
        })
        .get_async("/api/products/:id", |_, ctx| async move {
            let id = ctx.param("id").cloned().unwrap_or_default();
            routes::products::handle_get(&id, &ctx.env).await
        })
        .get_async("/api/categories", |_, ctx| async move {
            routes::categories::handle_list(ctx.env).await
        })
        .get_async("/api/shop-settings", |_, ctx| async move {
            routes::shop::handle_settings(ctx.env).await
        })
        // Shopper try-on
        .post_async("/api/person-upload", |req, ctx| async move {
            routes::person::handle_upload(req, ctx.env).await
        })
        // Device registry, free-try-on quota and unlock codes
        .post_async("/api/device", |req, ctx| async move {
            routes::device::handle_register(req, ctx.env).await
        })
        .post_async("/api/device/contact", |req, ctx| async move {
            routes::device::handle_contact(req, ctx.env).await
        })
        .post_async("/api/device/redeem", |req, ctx| async move {
            routes::tokens::handle_redeem(req, ctx.env).await
        })
        // Per-device photo backup (object storage) + owner storage view
        .post_async("/api/device/photos", |req, ctx| async move {
            routes::photos::handle_backup(req, ctx.env).await
        })
        .get_async("/api/studio/photos", |req, ctx| async move {
            routes::photos::handle_list(req, ctx.env).await
        })
        .get_async("/api/studio/photo", |req, ctx| async move {
            routes::photos::handle_get(req, ctx.env).await
        })
        .post_async("/api/studio/photos/delete", |req, ctx| async move {
            routes::photos::handle_delete(req, ctx.env).await
        })
        .post_async("/api/try-on/sync", |req, ctx| async move {
            routes::tryon::handle_sync(req, ctx.env).await
        })
        .post_async("/api/try-on", |req, ctx| async move {
            routes::tryon::handle_sync(req, ctx.env).await
        })
        .get_async("/api/generations/:id", |_, ctx| async move {
            let id = ctx.param("id").cloned().unwrap_or_default();
            routes::tryon::handle_generation(ctx.env, &id).await
        })
        // Owner-only writes
        .post_async("/api/owner/login", |req, ctx| async move {
            routes::owner::handle_login(req, ctx.env).await
        })
        .post_async("/api/owner/logout", |_, _| async move {
            routes::owner::handle_logout().await
        })
        .post_async("/api/studio/products", |req, ctx| async move {
            routes::studio::handle_create(req, ctx.env).await
        })
        .post_async("/api/studio/categories", |req, ctx| async move {
            routes::categories::handle_create(req, ctx.env).await
        })
        .post_async("/api/studio/shop", |req, ctx| async move {
            routes::shop::handle_save(req, ctx.env).await
        })
        // Owner dashboard: usage stats, unlock codes, free-try-on allowance
        .get_async("/api/studio/usage", |req, ctx| async move {
            routes::usage::handle_usage(req, ctx.env).await
        })
        .post_async("/api/studio/tokens", |req, ctx| async move {
            routes::tokens::handle_mint(req, ctx.env).await
        })
        .post_async("/api/studio/tokens/delete", |req, ctx| async move {
            routes::tokens::handle_delete(req, ctx.env).await
        })
        .post_async("/api/studio/settings", |req, ctx| async move {
            routes::quota::handle_settings(req, ctx.env).await
        })
        .post_async("/api/studio/devices/block", |req, ctx| async move {
            routes::usage::handle_device_block(req, ctx.env).await
        })
        .post_async("/api/studio/tokens/cancel", |req, ctx| async move {
            routes::tokens::handle_cancel(req, ctx.env).await
        })
        .post_async("/api/studio/tokens/purge", |req, ctx| async move {
            routes::tokens::handle_purge(req, ctx.env).await
        })
        .get_async("/api/studio/credits", |req, ctx| async move {
            routes::usage::handle_credits(req, ctx.env).await
        })
        .run(req, env)
        .await
}
