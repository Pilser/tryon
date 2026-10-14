use leptos::*;
use shared::models::{Product, TryOnRequest};

/// Button that sends a try‑on request for a given product.
#[component]
pub fn TryOnButton(product: Product) -> impl IntoView {
    let on_click = move |_| {
        let req = TryOnRequest {
            product_id: product.id.clone(),
            person_image_id: "initial-person".to_string(),
        };
        // In a real app we'd `fetch("/try-on", ...)` here.
        log!("try‑on request for {}", product.title);
    };

    view! {
        <button class="try-on-btn" onclick=on_click>
            "Try on"
        </button>
    }
}

/// Form component that can be used to submit a try‑on request.
#[component]
pub fn TryOnForm(product_id: String, person_image_id: String) -> impl IntoView {
    let req = TryOnRequest {
        product_id,
        person_image_id,
    };

    let on_click = move |_| {
        // In a real app we would `fetch("/try-on", ...)` here.
        log!("try‑on request submitted for product {}", product_id);
    };

    view! {
        <button class="try-on-btn" onclick=on_click>
            "Try on"
        </button>
    }
}