use urlencoding::encode;

/// Build a `wa.me` inquire link. Pure function, no network.
pub fn inquire_url(owner_whatsapp: &str, shop_name: &str, title: &str, product_id: &str) -> String {
    let digits: String = owner_whatsapp
        .chars()
        .filter(|c| c.is_ascii_digit())
        .collect();
    let text = format!("Hi {shop_name}! I like {title} ({product_id}). Is it available?");
    format!("https://wa.me/{digits}?text={}", encode(&text))
}

/// Share-to-WhatsApp link for a product page. The URL points at Worker SSR
/// so the chat preview unfurls with title + image.
pub fn wa_share_url(origin: &str, title: &str, product_id: &str) -> String {
    let page = crate::photo::share_url(origin, product_id);
    let text = format!("Check this out: {title} {page}");
    format!("https://wa.me/?text={}", encode(&text))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_wa_link_with_digits_only() {
        let url = inquire_url("+254 712-345678", "Zara", "Silk Dress", "p1");
        assert!(url.starts_with("https://wa.me/254712345678?text="));
        assert!(url.contains("Silk%20Dress"));
    }

    #[test]
    fn wa_share_links_product_page() {
        let url = wa_share_url("https://shop.com", "Silk Dress", "p1");
        assert!(url.starts_with("https://wa.me/?text="));
        assert!(url.contains("product%2Fp1"));
    }
}
