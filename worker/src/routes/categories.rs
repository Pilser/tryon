/* routes/categories.rs - owner-managed categories (title + icon in R2). */
use wasm_bindgen::JsValue;
use worker::{Env, FormEntry, HttpMetadata, Request, Response};

#[derive(serde::Deserialize)]
struct CategoryRow {
    #[serde(default)]
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    image_url: String,
}

/// Which image a category row ends up with: the freshly uploaded one wins,
/// otherwise the row keeps what it had. Pure + tested.
pub fn next_image(new_url: Option<&str>, existing: Option<&str>) -> Result<String, &'static str> {
    if let Some(u) = new_url {
        if !u.is_empty() {
            return Ok(u.to_string());
        }
    }
    match existing {
        Some(e) if !e.is_empty() => Ok(e.to_string()),
        _ => Err("category image required"),
    }
}

/// Owner-managed categories from D1. `Err` (no binding yet) means the
/// caller falls back to deriving icons from product rows client-side.
async fn d1_list(env: &Env) -> worker::Result<Vec<tryon_shared::models::Category>> {
    let db = env.d1("DB")?;
    let res = db
        .prepare("SELECT id,title,image_url FROM categories ORDER BY title ASC")
        .all()
        .await?;
    Ok(res
        .results::<CategoryRow>()?
        .into_iter()
        .map(|r| tryon_shared::models::Category {
            id: r.id,
            title: r.title,
            image_url: r.image_url,
        })
        .collect())
}

/// `GET /api/categories` — empty list when D1 has no binding yet.
pub async fn handle_list(env: Env) -> worker::Result<Response> {
    match d1_list(&env).await {
        Ok(cats) => Response::from_json(&cats),
        Err(_) => Response::from_json(&Vec::<tryon_shared::models::Category>::new()),
    }
}

/// Owner category upload: Bearer-gated, icon file to R2
/// (`categories/<id>.<ext>`), row into D1, full `Category` JSON back.
pub async fn handle_create(mut req: Request, env: Env) -> worker::Result<Response> {
    let expected = crate::routes::owner::env_token(&env);
    let auth = req
        .headers()
        .get("authorization")
        .map_err(|e| worker::Error::RustError(e.to_string()))?
        .unwrap_or_default();
    if !crate::routes::studio::authorized(Some(&auth), &expected) {
        return crate::routes::errors::unauthorized();
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
        return crate::routes::errors::not_configured("R2_PUBLIC_BASE missing");
    }
    let form = req
        .form_data()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let title = form
        .get_field("title")
        .unwrap_or_default()
        .trim()
        .to_string();
    if title.is_empty() {
        return crate::routes::errors::bad_request("TITLE_REQUIRED", "title required");
    }
    // The table has to exist for BOTH paths: a new category (no id)
    // used to skip the DDL and die with "no such table: categories".
    crate::store::exec_one(&db, crate::routes::studio::CATEGORIES_DDL)
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    // Update path: keep the existing image unless a new file arrives.
    let mut id = form.get_field("id").unwrap_or_default().trim().to_string();
    let mut existing = None;
    if !id.is_empty() {
        let old: Option<CategoryRow> = db
            .prepare("SELECT id,title,image_url FROM categories WHERE id=?")
            .bind(&[JsValue::from(id.clone())])
            .map_err(|e| worker::Error::RustError(e.to_string()))?
            .first(None)
            .await
            .map_err(|e| worker::Error::RustError(e.to_string()))?;
        match old {
            Some(row) => existing = Some(row.image_url),
            None => id.clear(),
        }
    }
    let mut uploaded = None;
    if let Some(FormEntry::File(f)) = form.get("image") {
        let bytes = f
            .bytes()
            .await
            .map_err(|e| worker::Error::RustError(e.to_string()))?;
        if !bytes.is_empty() {
            crate::routes::person::check_file_part(&f.type_(), bytes.len())
                .map_err(|e| worker::Error::RustError(e.to_string()))?;
            if id.is_empty() {
                id = crate::routes::ids::new_id('c');
            }
            let key = crate::routes::studio::slot_key(&id, "icon", &f.name());
            bucket
                .put(key.clone(), bytes)
                .http_metadata(HttpMetadata {
                    content_type: Some(f.type_()),
                    ..Default::default()
                })
                .execute()
                .await
                .map_err(|e| worker::Error::RustError(e.to_string()))?;
            uploaded = Some(crate::routes::studio::public_url(&base, &key));
        }
    }
    let image_url = match next_image(uploaded.as_deref(), existing.as_deref()) {
        Ok(u) => u,
        Err(e) => return crate::routes::errors::bad_request("IMAGE_REQUIRED", e),
    };
    if id.is_empty() {
        id = crate::routes::ids::new_id('c');
    }
    let created = format!("{}", js_sys::Date::now() as u64);
    crate::store::exec_one(&db, crate::routes::studio::CATEGORIES_DDL)
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    db.prepare(
        "INSERT INTO categories (id,title,image_url,created_at) VALUES (?,?,?,?) \
         ON CONFLICT(id) DO UPDATE SET title=excluded.title,\
         image_url=excluded.image_url",
    )
    .bind(&[
        JsValue::from(id.clone()),
        JsValue::from(title.clone()),
        JsValue::from(image_url.clone()),
        JsValue::from(created),
    ])
    .map_err(|e| worker::Error::RustError(e.to_string()))?
    .run()
    .await
    .map_err(|e| worker::Error::RustError(e.to_string()))?;
    Response::from_json(&tryon_shared::models::Category {
        id,
        title,
        image_url,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_upload_wins_then_falls_back_to_existing() {
        assert_eq!(
            next_image(Some("new.jpg"), Some("old.jpg")).unwrap(),
            "new.jpg"
        );
        assert_eq!(next_image(None, Some("old.jpg")).unwrap(), "old.jpg");
        assert_eq!(next_image(Some(""), Some("old.jpg")).unwrap(), "old.jpg");
        assert!(next_image(None, None).is_err());
    }
}
