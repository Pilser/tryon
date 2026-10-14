use tryon_shared::models::{Product, ShopSettings};

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn card(p: &Product, wa: &str, shop: &str) -> String {
    let inquire = tryon_shared::whatsapp::inquire_url(wa, shop, &p.title, &p.id);
    format!(
        r#"<article class="card"><img loading="lazy" src="{img}" alt="{title}"/><div class="card-body"><span class="badge">{cat}</span><h3>{title}</h3><p class="price">{price}</p><div class="actions"><a class="btn primary" href="/product/{id}">Try On</a><a class="btn wa" target="_blank" rel="noopener" href="{wa}">Inquire</a></div></div></article>"#,
        img = esc(&p.image_url),
        title = esc(&p.title),
        cat = esc(&p.category),
        price = esc(&p.price_display()),
        id = esc(&p.id),
        wa = esc(&inquire),
    )
}

/// Full `<head>` so WhatsApp/Twitter bots (no JS) pull title + description
/// + full image. `origin` must be absolute (`https://shop.workers.dev`).
fn shell(title: &str, desc: &str, image: &str, canonical: &str, body: &str) -> String {
    format!(
        r#"<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>{t}</title><meta name="description" content="{d}"/><link rel="canonical" href="{c}"/><meta property="og:type" content="product"/><meta property="og:title" content="{t}"/><meta property="og:description" content="{d}"/><meta property="og:image" content="{i}"/><meta property="og:url" content="{c}"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="{t}"/><meta name="twitter:description" content="{d}"/><meta name="twitter:image" content="{i}"/><link rel="stylesheet" href="/styles/main.css"/></head><body><div id="app">{b}</div><script type="module" src="/bundle.js"></script></body></html>"#,
        t = esc(title),
        d = esc(desc),
        i = esc(image),
        c = esc(canonical),
        b = body
    )
}

/// SSR landing: SEO HTML + hydrated grid client-side.
pub fn render_landing(shop: &ShopSettings, products: &[Product], origin: &str) -> String {
    let cards: String = products.iter().map(|p| card(p, &shop.owner_whatsapp, &shop.shop_name)).collect();
    let body = format!(
        r#"<header class="hero"><h1>{shop}</h1><p>Shop the collection. Try it on virtually, or inquire on WhatsApp.</p><div class="filterbar"><input id="q" type="search" placeholder="Search products…"/><div id="cats"></div></div></header><main class="grid">{cards}</main>"#,
        shop = esc(&shop.shop_name),
        cards = cards
    );
    let first_img = products.first().map(|p| p.image_url.clone()).unwrap_or_else(|| shop.logo_url.clone());
    shell(&shop.shop_name, "Shop the collection with AI virtual try-on.", &first_img, origin, &body)
}

/// SSR product page. This exact URL is what shoppers share, so bots get
/// the product image + title + description with zero JS.
pub fn render_detail(shop: &ShopSettings, p: &Product, origin: &str) -> String {
    let canonical = tryon_shared::photo::share_url(origin, &p.id);
    let body = format!(
        r#"<a href="/">← Back</a>{card}<div id="tryon" data-product="{id}"></div>"#,
        card = card(p, &shop.owner_whatsapp, &shop.shop_name),
        id = esc(&p.id)
    );
    shell(&p.title, &p.description, &p.image_url, &canonical, &body)
}

pub fn render_admin(shop: &ShopSettings, origin: &str) -> String {
    let body = format!(
        r#"<h1>Admin — {shop}</h1><form id="upload" method="post" action="/api/admin/products" enctype="multipart/form-data"><input name="title" required placeholder="Title"/><input name="price_cents" type="number" required placeholder="Price (cents)"/><input name="category" placeholder="Category"/><input name="image" type="file" accept="image/*" required/><button type="submit">Upload to R2</button></form><div id="admin-list"></div>"#,
        shop = esc(&shop.shop_name)
    );
    shell("Admin", "Owner product upload.", "", origin, &body)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shop() -> ShopSettings {
        ShopSettings {
            shop_name: "S".into(),
            owner_whatsapp: "123".into(),
            currency: "USD".into(),
            logo_url: "".into(),
        }
    }

    fn product() -> Product {
        Product {
            id: "p1".into(),
            title: "Silk Dress".into(),
            description: "Red silk".into(),
            price_cents: 4999,
            currency: "USD".into(),
            image_url: "https://cdn/x.jpg".into(),
            r2_key: "".into(),
            category: "Dresses".into(),
            sizes: vec![],
            created_at: "".into(),
        }
    }

    #[test]
    fn landing_contains_cards_and_wa_link() {
        let html = render_landing(&shop(), &[], "https://shop.com");
        assert!(html.contains("Search products"));
        assert!(html.contains("og:title"));
    }

    #[test]
    fn detail_has_absolute_og_image_for_bots() {
        let html = render_detail(&shop(), &product(), "https://shop.com");
        assert!(html.contains(r#"property="og:image" content="https://cdn/x.jpg""#));
        assert!(html.contains("https://shop.com/product/p1"));
        assert!(html.contains("twitter:card"));
    }
}
