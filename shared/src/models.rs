/// Core product data used by both client (SSR) and worker (API).
#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
pub struct Product {
    pub id: String,
    pub title: String,
    pub description: String,
    pub price: f32,
    pub image_url: String,
}

/// Request sent from client to worker to start a try-on.
#[derive(Clone, Debug, serde::Deserialize)]
pub struct TryOnRequest {
    pub product_id: String,
    pub person_image_id: String,
}

/// Response from worker when a try-on is started.
#[derive(Clone, Debug, serde::Serialize)]
pub struct TryOnResponse {
    pub generation_id: String,
    pub status: String,
}