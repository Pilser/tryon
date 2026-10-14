use leptos::*;
use tryon_shared::{inquire_url, photo::share_url, wa_share_url};

#[component]
pub fn WhatsappButton(owner_whatsapp: String, shop_name: String, title: String, product_id: String) -> impl IntoView {
    let url = inquire_url(&owner_whatsapp, &shop_name, &title, &product_id);
    view! { <a class="btn wa" target="_blank" href=url>"Inquire on WhatsApp"</a> }
}

/// Share row: readonly SSR link (bots unfurl it with image + title) +
/// WhatsApp share. Plain link element so no-JS clients still get the URL.
#[component]
pub fn ShareButtons(title: String, product_id: String) -> impl IntoView {
    let origin = web_sys::window()
        .and_then(|w| w.location().origin().ok())
        .unwrap_or_default();
    let page = share_url(&origin, &product_id);
    let wa = wa_share_url(&origin, &title, &product_id);
    view! {
        <div class="share-row">
            <input class="share-link" readonly value=page.clone() onclick="this.select()"/>
            <a class="btn" target="_blank" href=wa>"Share on WhatsApp"</a>
        </div>
    }
}
