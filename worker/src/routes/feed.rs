/* routes/feed.rs - the public product feed for a customer's landing
page. The landing dist is static HTML served at the shop's root; it
fetches this to list the products and links every card to the shop's
product page. CORS-open (a landing page may live on the customer's
own domain or anywhere else) and cacheable, so a static page can
embed it without a server. */
use serde::Serialize;
use tryon_shared::models::Product;
use worker::{Env, Request, Response, Result};

/// One product, ready to render as a card.
#[derive(Debug, Clone, Serialize)]
pub struct FeedItem {
    pub id: String,
    pub title: String,
    pub price_cents: u32,
    pub currency: String,
    pub image: String,
    /// Where the card links: the shop's product page.
    pub url: String,
    pub category: String,
    pub sizes: Vec<String>,
}

/// Pure: a product as a feed card, with the link built from the shop's
/// own base (tested).
pub fn item(p: &Product, base: &str) -> FeedItem {
    let base = base.trim_end_matches('/');
    FeedItem {
        id: p.id.clone(),
        title: p.title.clone(),
        price_cents: p.price_cents,
        currency: p.currency.clone(),
        image: p.image_url.clone(),
        url: format!("{base}/product/{}", p.id),
        category: p.category.clone(),
        sizes: p.sizes.clone(),
    }
}

/// The shop's own origin (the request URL), so the links work on the
/// customer's domain too.
pub fn origin(req: &Request) -> String {
    req.url()
        .map(|u| format!("{}://{}", u.scheme(), u.host_str().unwrap_or_default()))
        .unwrap_or_default()
}

/// `GET /api/feed` - the product feed.
pub async fn handle_feed(req: &Request, env: &Env) -> Result<Response> {
    let base = origin(req);
    let shop = crate::routes::shop::merged(env).await;
    let products = crate::routes::products::all(env).await;
    let body = serde_json::json!({
        "shop": {
            "name": shop.shop_name,
            "logo": shop.logo_url,
            "url": base,
            "studio": format!("{}/studio", base.trim_end_matches('/')),
        },
        "items": products.iter().map(|p| item(p, &base)).collect::<Vec<_>>(),
    });
    let mut res = Response::from_json(&body)?;
    let headers = res.headers_mut();
    headers.set("access-control-allow-origin", "*")?;
    headers.set("cache-control", "public, max-age=60, s-maxage=300")?;
    Ok(res)
}

/// `OPTIONS /api/feed` - the CORS preflight.
pub fn handle_preflight() -> Result<Response> {
    let mut res = Response::from_json(&serde_json::json!({}))?;
    let headers = res.headers_mut();
    headers.set("access-control-allow-origin", "*")?;
    headers.set("access-control-allow-methods", "GET, OPTIONS")?;
    headers.set("access-control-allow-headers", "content-type")?;
    headers.set("access-control-max-age", "86400")?;
    Ok(res)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn product() -> Product {
        Product {
            id: "coat-01".into(),
            title: "Wax coat".into(),
            description: "d".into(),
            price_cents: 450_000,
            currency: "UGX".into(),
            image_url: "https://cdn.example/coat.jpg".into(),
            model_image_url: String::new(),
            styled_image_url: String::new(),
            r2_key: "k".into(),
            category: "Jackets".into(),
            sizes: vec!["M".into(), "L".into()],
            created_at: "2026-01-01".into(),
        }
    }

    #[test]
    fn feed_items_link_to_the_product_page() {
        let it = item(&product(), "https://shop.latiforge.com/");
        assert_eq!(it.url, "https://shop.latiforge.com/product/coat-01");
        assert_eq!(it.price_cents, 450_000);
        assert_eq!(it.sizes, vec!["M".to_string(), "L".to_string()]);
    }
}
