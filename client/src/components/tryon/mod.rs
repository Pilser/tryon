pub mod studio;

pub use studio::TryOnStudio;

use leptos::*;

/// Card CTA that lands on the product page where the persistent studio lives.
#[component]
pub fn TryOnButton(product_id: String) -> impl IntoView {
    view! { <a class="btn primary" href=format!("/product/{product_id}")>"Try On"</a> }
}
