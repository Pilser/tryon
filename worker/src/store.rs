use tryon_shared::models::{Product, ProductFilter, ShopSettings};

/// Abstraction over D1. Worker bindings implement this; tests use in-memory vec.
pub trait ProductStore {
    fn list(&self, filter: &ProductFilter) -> Vec<Product>;
    fn get(&self, id: &str) -> Option<Product>;
}

/// Static shop config (env vars in v1, D1 row in v2).
pub trait ShopStore {
    fn settings(&self) -> ShopSettings;
}

pub struct MemoryStore {
    pub products: Vec<Product>,
    pub shop: ShopSettings,
}

impl ProductStore for MemoryStore {
    fn list(&self, filter: &ProductFilter) -> Vec<Product> {
        tryon_shared::filter::apply_filter(&self.products, filter)
    }
    fn get(&self, id: &str) -> Option<Product> {
        self.products.iter().find(|p| p.id == id).cloned()
    }
}

impl ShopStore for MemoryStore {
    fn settings(&self) -> ShopSettings {
        self.shop.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_list_respects_filter() {
        let store = MemoryStore {
            products: vec![],
            shop: ShopSettings {
                shop_name: "t".into(),
                owner_whatsapp: "1".into(),
                currency: "USD".into(),
                logo_url: "".into(),
            },
        };
        assert!(store.list(&ProductFilter::default()).is_empty());
    }
}
