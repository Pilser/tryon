use leptos::*;
use tryon_shared::inquire_url;

#[component]
pub fn WhatsappButton(owner_whatsapp: String, shop_name: String, title: String, product_id: String) -> impl IntoView {
    let url = inquire_url(&owner_whatsapp, &shop_name, &title, &product_id);
    view! { <a class="btn wa" target="_blank" href=url>"Inquire on WhatsApp"</a> }
}
