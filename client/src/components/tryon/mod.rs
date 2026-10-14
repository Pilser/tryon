use leptos::*;
use tryon_shared::models::Product;

#[component]
pub fn TryOnButton(product_id: String) -> impl IntoView {
    view! { <a class="btn primary" href=format!("/product/{product_id}")>"Try On"</a> }
}

#[component]
pub fn TryOnPanel(product: Product) -> impl IntoView {
    let (result, set_result) = create_signal::<Option<String>>(None);
    let pid = product.id.clone();
    let start = move |_| {
        let pid = pid.clone();
        spawn_local(async move {
            let req = tryon_shared::models::TryOnRequest {
                product_id: pid,
                person_image_id: "upload-first".into(),
            };
            let res = gloo_net::http::Request::post("/api/try-on")
                .json(&req)
                .unwrap()
                .send()
                .await;
            if let Ok(r) = res {
                if let Ok(v) = r.json::<serde_json::Value>().await {
                    set_result.set(Some(v.to_string()));
                }
            }
        });
    };
    view! {
        <div class="tryon">
            <button class="btn primary" on:click=start>"Start try-on"</button>
            {move || result.get().map(|r| view! { <pre>{r}</pre> })}
        </div>
    }
}
