use leptos::*;
use leptos_router::*;

fn product_page(id: String) -> impl IntoView {
    // Resource fetches product data from the worker (SSR HTML + hydration)
    let product = use_resource(move || async move {
        reqwest::get(format!("/product/{}", id))
            .await
            .unwrap()
            .json::<shared::models::Product>()
            .await
            .unwrap()
    });

    view! {
        <Suspense fallback="Loading product…">
            {move || {
                match product.get() {
                    Ok(Some(p)) => {
                        view! {
                            <article>
                                <header>
                                    <h2>{p.title}</h2>
                                    <p>{p.description}</p>
                                </header>
                                <ProductCard product=p />
                                <TryOnButton product=p />
                            </article>
                        }
                        .into_view()
                    }
                    _ => view! { <p>"Loading…"</p> }.into_view(),
                }
            }}
        </Suspense>
    }
}

fn home_page() -> impl IntoView {
    view! {
        <section>
            <h2>"Product Catalog"</h2>
            <p>"Browse products and click \"Try on\" to see the virtual try‑on in action."</p>
        </section>
    }
}

fn main() {
    // Leptos mounts to <div id="app"> in client/index.html
    // The same component tree is rendered on the server (worker) for SSR.
    leptos::mount_to_body(|cx| {
        let routes = Router::new()
            .add("/", |_| view! { cx <HomePage/> })
            .add_route("/product/:id", move |id| product_page(id));

        <Router routes routes />
    });
}