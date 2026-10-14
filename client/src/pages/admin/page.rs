use leptos::*;
use crate::components::{admin::UploadForm, layout::Header};

#[component]
pub fn AdminPage() -> impl IntoView {
    view! {
        <Header shop_name="Admin".to_string()/>
        <main class="admin">
            <h1>"Upload product (stores in R2)"</h1>
            <UploadForm/>
            <div id="admin-list"><p>"After upload the product appears on the landing grid."</p></div>
        </main>
    }
}
