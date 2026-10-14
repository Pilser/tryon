use leptos::*;
use shared::models::TryOnRequest;

/// Button that sends a try-on request to the worker.
#[component]
pub fn TryOnButton(product: shared::models::Product) -> impl IntoView {
    let on_click = move |_| {
        let req = TryOnRequest {
            product_id: product.id.clone(),
            person_image_id: "initial-person".to_string(),
        };
        // In a real app we'd `fetch("/try-on", ...)` here.
        log!("try-on request for {}", product.title);
    };

    view! {
        <button class="try-on-btn" onclick=on_click>
            "Try on"
        </button>
    }
}