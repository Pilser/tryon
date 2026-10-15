/// Admin helpers: R2 object key builder + bearer check. Pure + tested.
pub fn r2_key(product_id: &str, filename: &str) -> String {
    let ext = filename.rsplit('.').next().unwrap_or("jpg");
    format!("products/{product_id}.{ext}")
}

/// Per-slot R2 key so one product holds garment/model/styled side by side:
/// `products/<id>-garment.jpg`, `products/<id>-model.jpg`, ...
pub fn slot_key(product_id: &str, slot: &str, filename: &str) -> String {
    let ext = filename.rsplit('.').next().unwrap_or("jpg");
    format!("products/{product_id}-{slot}.{ext}")
}

pub fn authorized(header: Option<&str>, expected: &str) -> bool {
    match header {
        Some(h) => h == &format!("Bearer {expected}") || (expected.is_empty()),
        None => expected.is_empty(),
    }
}

/// Text fields of the owner bundle form, validated. Pure + tested.
pub struct AdminText {
    pub title: String,
    pub description: String,
    pub price_cents: u32,
    pub category: String,
    pub sizes: Vec<String>,
}

pub fn parse_text(
    title: &str,
    description: &str,
    price_cents: &str,
    category: &str,
    sizes_csv: &str,
) -> Result<AdminText, &'static str> {
    if title.trim().is_empty() {
        return Err("title required");
    }
    Ok(AdminText {
        title: title.trim().to_string(),
        description: description.trim().to_string(),
        price_cents: price_cents.trim().parse().unwrap_or(0),
        category: category.trim().to_string(),
        sizes: parse_sizes(sizes_csv),
    })
}

pub fn parse_sizes(csv: &str) -> Vec<String> {
    csv.split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// Public URL for an R2 object: `{base}/{key}` with `base` from the
/// `R2_PUBLIC_BASE` env var (custom domain or r2.dev bucket URL).
pub fn public_url(base: &str, key: &str) -> String {
    format!("{}/{key}", base.trim_end_matches('/'))
}

/// v1 schema, applied idempotently (`IF NOT EXISTS`) on each admin write
/// so no separate migration step is needed before the first upload.
pub const PRODUCTS_DDL: &str = "CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    image_url TEXT NOT NULL DEFAULT '',
    model_image_url TEXT NOT NULL DEFAULT '',
    styled_image_url TEXT NOT NULL DEFAULT '',
    r2_key TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    sizes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ''
)";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_r2_key() {
        assert_eq!(r2_key("abc", "photo.png"), "products/abc.png");
    }

    #[test]
    fn builds_slot_keys() {
        assert_eq!(
            slot_key("abc", "garment", "flat.PNG"),
            "products/abc-garment.PNG"
        );
        assert_eq!(
            slot_key("abc", "model", "noext"),
            "products/abc-model.noext"
        );
    }

    #[test]
    fn parses_bundle_text() {
        let t = parse_text(" Tee ", "Cotton", "1999", "Tops", "S, M,,L ").unwrap();
        assert_eq!(t.title, "Tee");
        assert_eq!(t.price_cents, 1999);
        assert_eq!(t.sizes, vec!["S", "M", "L"]);
        assert!(parse_text("  ", "x", "1", "", "").is_err());
        assert_eq!(
            parse_text("T", "", "not-a-number", "", "")
                .unwrap()
                .price_cents,
            0
        );
    }

    #[test]
    fn builds_public_url() {
        assert_eq!(
            public_url("https://cdn.example.com/", "products/a.jpg"),
            "https://cdn.example.com/products/a.jpg"
        );
    }
}
