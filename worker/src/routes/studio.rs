/* routes/studio.rs - owner bundle upload (R2 + D1) and its pure helpers. */
use wasm_bindgen::JsValue;
use worker::{Env, FormEntry, HttpMetadata, Request, Response};

/// Studio (owner) helpers: R2 object key builder + bearer check. Pure + tested.
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

/// Shop logo key. Stays the original slot layout (`products/shop-logo.<ext>`)
/// so logos written by earlier builds keep resolving.
pub fn shop_logo_key(filename: &str) -> String {
    slot_key("shop", "logo", filename)
}

pub fn authorized(header: Option<&str>, expected: &str) -> bool {
    match header {
        Some(h) => h == &format!("Bearer {expected}") || (expected.is_empty()),
        None => expected.is_empty(),
    }
}

/// Text fields of the owner bundle form, validated. Pure + tested.
pub struct StudioText {
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
) -> Result<StudioText, &'static str> {
    if title.trim().is_empty() {
        return Err("title required");
    }
    Ok(StudioText {
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
    format!("{}/{}", base.trim_end_matches('/'), key)
}

/// New product id (`p…`), owner-form uploads only.
pub fn new_product_id() -> String {
    crate::routes::ids::new_id('p')
}

/// Owner bundle upload: Bearer-gated, files to R2 (`products/<id>-<slot>.<ext>`
/// with content type), row into D1, full `Product` JSON back. Garment
/// (`image0`) is required; model/styled may follow later (styled can even
/// be generated from a try-on result in the studio).
pub async fn handle_create(mut req: Request, env: Env) -> worker::Result<Response> {
    let expected = crate::routes::owner::env_token(&env);
    let auth = req
        .headers()
        .get("authorization")
        .map_err(|e| worker::Error::RustError(e.to_string()))?
        .unwrap_or_default();
    if !authorized(Some(&auth), &expected) {
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
    let text = parse_text(
        &form.get_field("title").unwrap_or_default(),
        &form.get_field("description").unwrap_or_default(),
        &form.get_field("price_cents").unwrap_or_default(),
        &form.get_field("category").unwrap_or_default(),
        &form.get_field("sizes").unwrap_or_default(),
    )
    .map_err(|e| worker::Error::RustError(e.to_string()))?;
    // Update path: the owner form re-saves an existing id (unchanged
    // slots arrive with their current bytes, same R2 keys, no duplicates).
    let form_id = form.get_field("id").unwrap_or_default();
    let updating = !form_id.trim().is_empty();
    let id = if updating {
        form_id.trim().to_string()
    } else {
        new_product_id()
    };
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
            let key = slot_key(&id, slot, &f.name());
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
            urls[i] = public_url(&base, &key);
        }
    }
    if urls[0].is_empty() && !updating {
        return Response::error("garment photo (image0) required", 400);
    }
    let mut created = format!("{}", js_sys::Date::now() as u64);
    let sizes_csv = text.sizes.join(",");
    db.exec(PRODUCTS_DDL)
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    // Fill unchanged slots + created date from the existing row on update.
    if updating {
        let old: Option<crate::routes::products::ProductRow> = db
            .prepare(
                "SELECT id,title,description,price_cents,currency,image_url,\
                 model_image_url,styled_image_url,r2_key,category,sizes,created_at \
                 FROM products WHERE id=?",
            )
            .bind(&[JsValue::from(id.clone())])
            .map_err(|e| worker::Error::RustError(e.to_string()))?
            .first(None)
            .await
            .map_err(|e| worker::Error::RustError(e.to_string()))?;
        if let Some(row) = old {
            let old_urls = [row.image_url, row.model_image_url, row.styled_image_url];
            for (i, old_url) in old_urls.into_iter().enumerate() {
                if urls[i].is_empty() {
                    urls[i] = old_url;
                }
            }
            if first_key.is_empty() {
                first_key = row.r2_key;
            }
            if !row.created_at.is_empty() {
                created = row.created_at;
            }
        }
    }
    if urls[0].is_empty() {
        return Response::error("garment photo (image0) required", 400);
    }
    db.exec(PRODUCTS_DDL)
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    db.prepare(
        "INSERT INTO products (id,title,description,price_cents,currency,image_url,\
         model_image_url,styled_image_url,r2_key,category,sizes,created_at) \
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?) \
         ON CONFLICT(id) DO UPDATE SET title=excluded.title,\
         description=excluded.description,price_cents=excluded.price_cents,\
         currency=excluded.currency,image_url=excluded.image_url,\
         model_image_url=excluded.model_image_url,\
         styled_image_url=excluded.styled_image_url,r2_key=excluded.r2_key,\
         category=excluded.category,sizes=excluded.sizes,\
         created_at=excluded.created_at",
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

/// v1 schema, applied idempotently (`IF NOT EXISTS`) on each studio write
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

/// Owner-managed categories (title + icon image). Product rows keep a plain
/// category string; products whose category is empty or unknown surface
/// under Others on the client.
pub const CATEGORIES_DDL: &str = "CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
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
        // Logo keeps the historic key shape so old uploads still resolve.
        assert_eq!(shop_logo_key("logo.png"), "products/shop-logo.png");
    }

    #[test]
    fn builds_new_product_id() {
        // `new_product_id` needs the Worker clock, so only the pure id
        // builder is asserted here (see routes::ids).
        assert_eq!(crate::routes::ids::id_from('p', 0x1a2b, 0x3c), "p1a2b3c");
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
