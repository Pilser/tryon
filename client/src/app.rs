use leptos::*;
use leptos_router::*;

use crate::pages::{admin::AdminPage, landing::LandingPage, product_detail::ProductDetailPage};

#[component]
pub fn App() -> impl IntoView {
    view! {
        <Router>
            <Routes>
                <Route path="/" view=LandingPage/>
                <Route path="/product/:id" view=ProductDetailPage/>
                <Route path="/admin" view=AdminPage/>
            </Routes>
        </Router>
    }
}
