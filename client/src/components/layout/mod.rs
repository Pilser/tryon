use leptos::*;

/// Page header shown on every page.
#[component]
pub fn Header() -> impl IntoView {
    view! {
        <header>
            <h1>"Virtual Try‑On"</h1>
            <nav>
                <a href="/">Home</a>
            </nav>
        </header>
    }
}