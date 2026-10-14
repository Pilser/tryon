use leptos::*;
use tryon_shared::models::{Product, ProductFilter, ShopSettings};

use crate::components::{filters::{FilterPills, SearchBar}, layout::{Footer, Header}, product::ProductGrid};

#[component]
pub fn LandingPage() -> impl IntoView {
    let filter = create_rw_signal(ProductFilter::default());
    let products = create_resource(
        || (),
        |_| async {
            gloo_net::http::Request::get("/api/products")
                .send()
                .await
                .ok()
                .and_then(|r| r.json::<Vec<Product>>().await.ok())
                .unwrap_or_default()
        },
    );
    let shop = create_resource(
        || (),
        |_| async {
            gloo_net::http::Request::get("/api/shop-settings")
                .send()
                .await
                .ok()
                .and_then(|r| r.json::<ShopSettings>().await.ok())
                .unwrap_or(ShopSettings {
                    shop_name: "TryOn Shop".into(),
                    owner_whatsapp: "".into(),
                    currency: "USD".into(),
                    logo_url: "".into(),
                })
        },
    );

    view! {
        <Suspense fallback="Loading shop…">
            {move || shop.get().map(|s| {
                let s = s.unwrap_or_default_fallback();
                view! {
                    <Header shop_name=s.shop_name.clone()/>
                    <section class="hero">
                        <h1>{s.shop_name.clone()}</h1>
                        <p>"Shop the collection. Try it on virtually, or inquire on WhatsApp."</p>
                        <div class="filterbar"><SearchBar filter=filter/></div>
                    </section>
                    <Suspense fallback="Loading products…">
                        {move || products.get().map(|list| {
                            let list = list.unwrap_or_default();
                            let filtered = tryon_shared::apply_filter(&list, &filter.get());
                            let cats: Vec<String> = {
                                let mut c: Vec<String> = list.iter().map(|p| p.category.clone()).collect();
                                c.sort(); c.dedup(); c
                            };
                            view! {
                                <FilterPills filter=filter categories=cats/>
                                <p class="count">{format!("{} products", filtered.len())}</p>
                                <ProductGrid products=filtered shop_name=s.shop_name.clone() owner_whatsapp=s.owner_whatsapp.clone()/>
                            }
                        })}
                    </Suspense>
                    <Footer/>
                }
            })}
        </Suspense>
    }
}

trait Fallback {
    fn unwrap_or_default_fallback(self) -> ShopSettings;
}
impl Fallback for Option<ShopSettings> {
    fn unwrap_or_default_fallback(self) -> ShopSettings {
        self.unwrap_or(ShopSettings {
            shop_name: "TryOn Shop".into(),
            owner_whatsapp: "".into(),
            currency: "USD".into(),
            logo_url: "".into(),
        })
    }
}
