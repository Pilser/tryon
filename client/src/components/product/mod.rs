use leptos::*;
use tryon_shared::{inquire_url, models::Product};

#[component]
pub fn ProductCard(product: Product, shop_name: String, owner_whatsapp: String) -> impl IntoView {
    let wa = inquire_url(&owner_whatsapp, &shop_name, &product.title, &product.id);
    let detail = format!("/product/{}", product.id);
    view! {
        <article class="card">
            <img loading="lazy" src=product.image_url.clone() alt=product.title.clone()/>
            <div class="card-body">
                <span class="badge">{product.category.clone()}</span>
                <h3>{product.title.clone()}</h3>
                <p class="price">{product.price_display()}</p>
                <div class="actions">
                    <a class="btn primary" href=detail>"Try On"</a>
                    <a class="btn wa" target="_blank" href=wa>"Inquire"</a>
                </div>
            </div>
        </article>
    }
}

#[component]
pub fn ProductGrid(products: Vec<Product>, shop_name: String, owner_whatsapp: String) -> impl IntoView {
    view! {
        <div class="grid">
            <For each=move || products.clone() key=|p| p.id.clone() let:p>
                <ProductCard product=p.clone() shop_name=shop_name.clone() owner_whatsapp=owner_whatsapp.clone()/>
            </For>
        </div>
    }
}
