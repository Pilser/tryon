use leptos::*;

#[component]
pub fn Header(shop_name: String) -> impl IntoView {
    view! {
        <header class="topbar">
            <a class="brand" href="/">{shop_name}</a>
            <nav><a href="/admin">"Admin"</a></nav>
        </header>
    }
}

#[component]
pub fn Footer() -> impl IntoView {
    view! { <footer class="footer"><p>"Virtual try-on powered by Genlook"</p></footer> }
}
