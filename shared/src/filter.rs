use crate::models::{Product, ProductFilter};

/// Pure client+server shared filter. Used by SSR and Wasm identically.
pub fn apply_filter(products: &[Product], f: &ProductFilter) -> Vec<Product> {
    let q = f.query.to_lowercase();
    products
        .iter()
        .filter(|p| {
            if !f.category.is_empty() && p.category != f.category {
                return false;
            }
            if !f.size.is_empty() && !p.sizes.iter().any(|s| s == &f.size) {
                return false;
            }
            if let Some(max) = f.max_price_cents {
                if p.price_cents > max {
                    return false;
                }
            }
            if !q.is_empty() {
                let hay = format!("{} {}", p.title, p.description).to_lowercase();
                if !hay.contains(&q) {
                    return false;
                }
            }
            true
        })
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Vec<Product> {
        vec![
            Product {
                id: "1".into(),
                title: "Silk Dress".into(),
                description: "red".into(),
                price_cents: 4999,
                currency: "USD".into(),
                image_url: "".into(),
                model_image_url: "".into(),
                styled_image_url: "".into(),
                r2_key: "".into(),
                category: "Dresses".into(),
                sizes: vec!["M".into()],
                created_at: "".into(),
            },
            Product {
                id: "2".into(),
                title: "Denim Jacket".into(),
                description: "blue".into(),
                price_cents: 8999,
                currency: "USD".into(),
                image_url: "".into(),
                model_image_url: "".into(),
                styled_image_url: "".into(),
                r2_key: "".into(),
                category: "Jackets".into(),
                sizes: vec!["L".into()],
                created_at: "".into(),
            },
        ]
    }

    #[test]
    fn filters_by_query_and_category() {
        let all = sample();
        let out = apply_filter(
            &all,
            &ProductFilter {
                query: "silk".into(),
                ..Default::default()
            },
        );
        assert_eq!(out.len(), 1);
        let out = apply_filter(
            &all,
            &ProductFilter {
                category: "Jackets".into(),
                ..Default::default()
            },
        );
        assert_eq!(out.len(), 1);
    }
}
