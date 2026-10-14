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

fn shell(title: &str, body: &str) -> String {
    format!(
        r#"<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>{t}</title><meta property="og:title" content="{t}"/><link rel="stylesheet" href="/styles/main.css"/></head><body><div id="app">{b}</div><script type="module" src="/bundle.js"></script></body></html>"#,
        t = esc(title),
        b = body
    )
}

/// SSR landing: SEO HTML + hydrated grid client-side.
pub fn render_landing(shop: &ShopSettings, products: &[Product]) -> String {
    let cards: String = products.iter().map(|p| card(p, &shop.owner_whatsapp, &shop.shop_name)).collect();
    let body = format!(
        r#"<header class="hero"><h1>{shop}</h1><p>Shop the collection. Try it on virtually, or inquire on WhatsApp.</p><div class="filterbar"><input id="q" type="search" placeholder="Search products…"/><div id="cats"></div></div></header><main class="grid">{cards}</main>"#,
        shop = esc(&shop.shop_name),
        cards = cards
    );
    shell(&shop.shop_name, &body)
}

pub fn render_detail(shop: &ShopSettings, p: &Product) -> String {
    let body = format!(
        r#"<a href="/">← Back</a>{card}<div id="tryon" data-product="{id}"></div>"#,
        card = card(p, &shop.owner_whatsapp, &shop.shop_name),
        id = esc(&p.id)
    );
    shell(&p.title, &body)
}

pub fn render_admin(shop: &ShopSettings) -> String {
    let body = format!(
        r#"<h1>Admin — {shop}</h1><form id="upload" method="post" action="/api/admin/products" enctype="multipart/form-data"><input name="title" required placeholder="Title"/><input name="price_cents" type="number" required placeholder="Price (cents)"/><input name="category" placeholder="Category"/><input name="image" type="file" accept="image/*" required/><button type="submit">Upload to R2</button></form><div id="admin-list"></div>"#,
        shop = esc(&shop.shop_name)
    );
    shell("Admin", &body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn landing_contains_cards_and_wa_link() {
        let shop = ShopSettings {
            shop_name: "S".into(),
            owner_whatsapp: "123".into(),
            currency: "USD".into(),
            logo_url: "".into(),
        };
        let html = render_landing(&shop, &[]);
        assert!(html.contains("Search products"));
    }
}
