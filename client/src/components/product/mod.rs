use leptos::*;
use tryon_shared::{inquire_url, models::Product};

// GENERATED from figcraft: `inspect.code {id: 12, language: leptos}`
// (design/out/card-leptos.rs). Only adaptations: component props replace
// static text, and inert divs become working elements (photo, links,
// model inset). Structure, classes and geometry untouched.
#[component]
pub fn ProductCard(product: Product, shop_name: String, owner_whatsapp: String) -> impl IntoView {
    let wa = inquire_url(&owner_whatsapp, &shop_name, &product.title, &product.id);
    let detail = format!("/product/{}", product.id);
    let model = if product.model_image_url.is_empty() {
        product.image_url.clone()
    } else {
        product.model_image_url.clone()
    };
    view! {
        <div
            class="productcard"
            data-garment=product.image_url.clone()
            data-model=model.clone()
            data-styled=product.styled_image_url.clone()
        >
            <a href=detail.clone()>
                <img class="img main" loading="lazy" src=product.image_url.clone() alt=product.title.clone()/>
            </a>
            <div class="badge-pill"></div>
            <p class="badge">{product.category.clone()}</p>
            <button class="model-inset" aria-label="view model">
                <img loading="lazy" src=model alt="model without garment"/>
            </button>
            <p class="swap-cur">"Garment — tap model to swap"</p>
            <p class="title">{product.title.clone()}</p>
            <p class="price">{product.price_display()}</p>
            <a class="btn-tryon" href=detail>
                <span class="btn-tryon-label">"Try On"</span>
            </a>
            <a class="btn-inquire" target="_blank" href=wa>
                <span class="btn-inquire-label">"Inquire"</span>
            </a>
        </div>
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
