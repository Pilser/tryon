use leptos::*;
use shared::models::Product;

/// A simple card displaying product info.
#[component]
pub fn ProductCard(product: Product) -> impl IntoView {
    view! {
        <div class="product-card">
            <h3>{product.title}</h3>
            <p>{product.description}</p>
        </div>
    }
}