use leptos::ssr::render_to_string;
use leptos::view::StaticView;
use worker::{Request, Env, Context, Response, Result};
use shared::models::{Product, TryOnRequest, TryOnResponse};
use uuid::Uuid;
use reqwest::Client;

#[event]
fn fetch(req: Request, env: Env, ctx: Context) -> Result<Response> {
    let (method, path) = (req.method(), req.path());

    // ---------- Product detail with SSR ----------
    if method == "GET" && path.starts_with("/product/") {
        let id = path.strip_prefix("/product/").unwrap().to_string();
        let product = shared::models::Product {
            id,
            title: "Sample Product".to_string(),
            description: "A great product for try‑on".to_string(),
            price: 49.99,
            image_url: "/placeholder.jpg".to_string(),
        };

        let html = render_product_page(ctx.cx(), product);
        Response::html(html)
    } else if method == "POST" && path == "/try-on" {
        let body = req.json::<TryOnRequest>()?;

        // ------------------------------------------------------------------
        // TODO: Replace the stub with a real Genlook API call.
        // The worker can read the API key from the Cloudflare secret:
        //   env.GENLOOK_API_KEY
        // ------------------------------------------------------------------
        let gen_id = Uuid::new_v4().to_string();
        let resp = TryOnResponse {
            generation_id: gen_id.clone(),
            status: "pending".to_string(),
        };
        Response::json(&serde_json::json!({
            "generationId": gen_id,
            "status": "pending"
        }))
    } else if path.starts_with("/result/") {
        let id = path.strip_prefix("/result/").unwrap();
        let status = if id == "pending" { "pending" } else { "completed" };
        Response::json(&serde_json::json!({ "generationId": id, "status": status }))
    } else {
        Response::not_found("Unknown route")
    }
}

/// Render a Leptos product page to an HTML string with hydration markers.
fn render_product_page(cx: leptos::cx::Cx, product: Product) -> String {
    render_to_string(
        cx,
        view! { cx <StaticView> <product_page product=product/> </StaticView> },
        leptos::options::RendlerOptions {
            hydration: true,
        },
    )
}

// ---------------------------------------------------------------------
// Leptos view for the product page (used by the SSR helper).
// ---------------------------------------------------------------------
#[leptos::view]
fn product_page(product: Product) -> leptos::view::StaticView {
    view! {
        cx
        <article>
            <header>
                <h2>{product.title}</h2>
                <p>{product.description}</p>
            </header>
        </article>
    }
}