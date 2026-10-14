use leptos::*;
use leptos_router::*;
use tryon_shared::models::Product;

use crate::components::{inquire::WhatsappButton, layout::{Footer, Header}, tryon::TryOnPanel};

#[component]
pub fn ProductDetailPage() -> impl IntoView {
    let params = use_params_map();
    let id = move || params.get().get("id").cloned().unwrap_or_default();
    let product = create_resource(id, |id| async move {
        gloo_net::http::Request::get(&format!("/api/products/{id}"))
            .send()
            .await
            .ok()
            .and_then(|r| r.json::<Product>().await.ok())
    });

    view! {
        <Header shop_name="TryOn Shop".to_string()/>
        <Suspense fallback="Loading…">
            {move || product.get().map(|p| p.map(|p| view! {
                <article class="detail">
                    <img src=p.image_url.clone() alt=p.title.clone()/>
                    <div><h1>{p.title.clone()}</h1><p>{p.price_display()}</p>
                    <TryOnPanel product=p.clone()/>
                    <WhatsappButton owner_whatsapp="".to_string() shop_name="Shop".to_string() title=p.title.clone() product_id=p.id.clone()/></div>
                </article>
            }))}
        </Suspense>
        <Footer/>
    }
}
