use leptos::ssr::render_to_string;
use leptos::view::StaticView;
use worker::{Request, Env, Context, Response, Result};
use shared::models::{Product, TryOnRequest};

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

#[event]
fn fetch(req: Request, env: Env, ctx: Context) -> Result<Response> {
    let (method, path) = (req.method(), req.path());

    // ---------- Product detail with SSR ----------
    if method == "GET" && path.starts_with("/product/") {
        let id = path.strip_prefix("/product/").unwrap().to_string();
        // In a real app fetch from your DB or headless CMS.
        let product = shared::models::Product {
            id,
            title: "Sample Product".to_string(),
            description: "A great product for try‑on".to_string(),
            price: 49.99,
            image_url: "/placeholder.jpg".to_string(),
        };

        // Render the Leptos template to a full HTML string (SSR)
        let html = render_product_page(ctx.cx(), product);

        Response::html(html)
    } else if method == "POST" && path == "/try-on" {
        // Start a try‑on (Genlook integration placeholder)
        let body = req.json::<TryOnRequest>()?;
        // In a real worker you would call Genlook API here.
        // For now echo back a dummy generationId.
        let gen_id = uuid::Uuid::new_v4().to_string();
        Response::json(&serde_json::json!({ "generationId": gen_id }))
    } else if path.starts_with("/result/") {
        // Poll result endpoint
        let id = path.strip_prefix("/result/").unwrap();
        // In reality you'd query Genlook: GET /generations/:id
        let status = if id == "pending" { "pending" } else { "completed" };
        Response::json(&serde_json::json!({ "generationId": id, "status": status }))
    } else {
        Response::not_found("Unknown route")
    }
}