/* routes/products.rs - product list/get: D1 rows first, PRODUCTS_JSON seed
fallback for local dev. */
use serde::Deserialize;
use tryon_shared::models::ProductFilter;
use worker::{Env, Response, Result};

use crate::store::{MemoryStore, ProductStore};

/// Parse `/api/products?q=&category=&size=&max_price=` query string. Pure + tested.
pub fn parse_filter(query: &str) -> ProductFilter {
    let mut f = ProductFilter::default();
    for pair in query.split('&') {
        let mut it = pair.splitn(2, '=');
        let (k, v) = (it.next().unwrap_or(""), it.next().unwrap_or(""));
        match k {
            "q" => f.query = v.to_string(),
            "category" => f.category = v.to_string(),
            "size" => f.size = v.to_string(),
            "max_price" => f.max_price_cents = v.parse().ok(),
            _ => {}
        }
    }
    f
}

/// Row shape for D1 reads (`sizes` stays CSV in the table, split on read).
#[derive(Deserialize)]
pub struct ProductRow {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub price_cents: u32,
    #[serde(default)]
    pub currency: String,
    #[serde(default)]
    pub image_url: String,
    #[serde(default)]
    pub model_image_url: String,
    #[serde(default)]
    pub styled_image_url: String,
    #[serde(default)]
    pub r2_key: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub sizes: String,
    #[serde(default)]
    pub created_at: String,
}

pub fn row_to_product(r: ProductRow) -> tryon_shared::models::Product {
    tryon_shared::models::Product {
        sizes: r
            .sizes
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect(),
        currency: if r.currency.is_empty() {
            "USD".into()
        } else {
            r.currency
        },
        id: r.id,
        title: r.title,
        description: r.description,
        price_cents: r.price_cents,
        image_url: r.image_url,
        model_image_url: r.model_image_url,
        styled_image_url: r.styled_image_url,
        r2_key: r.r2_key,
        category: r.category,
        created_at: r.created_at,
    }
}

/// Owner-added products from D1. `Err` (no binding yet) means the caller
/// falls back to the `PRODUCTS_JSON` seed.
pub async fn d1_list(env: &Env) -> Result<Vec<tryon_shared::models::Product>> {
    let db = env.d1("DB")?;
    let res = db
        .prepare(
            "SELECT id,title,description,price_cents,currency,image_url,\
             model_image_url,styled_image_url,r2_key,category,sizes,created_at \
             FROM products ORDER BY created_at DESC",
        )
        .all()
        .await?;
    Ok(res
        .results::<ProductRow>()?
        .into_iter()
        .map(row_to_product)
        .collect())
}

/// Local-test + edge seed: JSON array of products in `PRODUCTS_JSON`.
fn seed(env: &Env) -> Vec<tryon_shared::models::Product> {
    env.var("PRODUCTS_JSON")
        .map(|v| v.to_string())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// D1 first (owner uploads), seed fallback for local dev.
pub async fn all(env: &Env) -> Vec<tryon_shared::models::Product> {
    d1_list(env).await.unwrap_or_else(|_| seed(env))
}

/// `GET /api/products` — filter + list.
pub async fn handle_list(query: &str, env: &Env) -> Result<Response> {
    let filter = parse_filter(query);
    let store = MemoryStore {
        products: all(env).await,
        shop: crate::routes::shop::merged(env).await,
    };
    Response::from_json(&store.list(&filter))
}

/// `GET /api/products/:id`.
pub async fn handle_get(id: &str, env: &Env) -> Result<Response> {
    let store = MemoryStore {
        products: all(env).await,
        shop: crate::routes::shop::merged(env).await,
    };
    match store.get(id) {
        Some(p) => Response::from_json(&p),
        None => Response::error("not found", 404),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_query() {
        let f = parse_filter("q=dress&category=Dresses&max_price=5000");
        assert_eq!(f.query, "dress");
        assert_eq!(f.max_price_cents, Some(5000));
    }

    #[test]
    fn row_splits_sizes_and_defaults_currency() {
        let p = row_to_product(ProductRow {
            id: "p1".into(),
            title: "Tee".into(),
            description: "".into(),
            price_cents: 100,
            currency: "".into(),
            image_url: "a.jpg".into(),
            model_image_url: "".into(),
            styled_image_url: "".into(),
            r2_key: "".into(),
            category: "".into(),
            sizes: "S, M ,,L".into(),
            created_at: "".into(),
        });
        assert_eq!(p.sizes, vec!["S", "M", "L"]);
        assert_eq!(p.currency, "USD");
    }
}
