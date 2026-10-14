mod app;
mod components;
mod pages;
mod photo;

use app::App;
use leptos::*;

fn main() {
    mount_to_body(|| view! { <App/> });
}
