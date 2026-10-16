use serde::{Deserialize, Serialize};

/// Product stored in D1, image bytes in R2. Every product carries a
/// 3-image bundle: the garment flat (`image_url`), the model WITHOUT the
/// garment (`model_image_url`), and the model WEARING it (`styled_image_url`,
/// empty until the first real try-on result is saved back).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Product {
    pub id: String,
    pub title: String,
    pub description: String,
    pub price_cents: u32,
    pub currency: String,
    pub image_url: String,
    #[serde(default)]
    pub model_image_url: String,
    #[serde(default)]
    pub styled_image_url: String,
    pub r2_key: String,
    pub category: String,
    pub sizes: Vec<String>,
    pub created_at: String,
}

impl Product {
    pub fn price_display(&self) -> String {
        format!("{:.2} {}", self.price_cents as f64 / 100.0, self.currency)
    }
}

/// Public shop config (safe to send to browser).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ShopSettings {
    pub shop_name: String,
    /// E.164 digits only, no `+` (e.g. `254712345678`).
    pub owner_whatsapp: String,
    pub currency: String,
    pub logo_url: String,
}

/// Query filters for the landing grid. All fields optional.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct ProductFilter {
    pub query: String,
    pub category: String,
    pub size: String,
    pub max_price_cents: Option<u32>,
}

/// Request sent from browser to Worker to start a try-on.
/// Worker adds the Genlook key server-side.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TryOnRequest {
    pub product_id: String,
    pub person_image_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TryOnResponse {
    pub generation_id: String,
    pub status: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GenerationStatus {
    pub generation_id: String,
    pub status: String,
    pub result_image_url: Option<String>,
}

/// Payload the studio owner form posts (multipart handled in worker).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StudioCreateProduct {
    pub title: String,
    pub description: String,
    pub price_cents: u32,
    pub category: String,
    pub sizes: Vec<String>,
}

/// Owner-managed category: title + icon image. Product rows keep a plain
/// category string; anything empty or unknown surfaces under Others.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub title: String,
    pub image_url: String,
}
