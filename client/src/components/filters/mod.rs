use leptos::*;
use tryon_shared::models::ProductFilter;

#[component]
pub fn SearchBar(filter: RwSignal<ProductFilter>) -> impl IntoView {
    view! {
        <input
            type="search"
            placeholder="Search products…"
            prop:value=move || filter.get().query
            on:input=move |ev| {
                let v = event_target_value(&ev);
                filter.update(|f| f.query = v);
            }
        />
    }
}

#[component]
pub fn FilterPills(filter: RwSignal<ProductFilter>, categories: Vec<String>) -> impl IntoView {
    view! {
        <div class="pills">
            <button on:click=move |_| filter.update(|f| f.category.clear())>"All"</button>
            <For each=move || categories.clone() key=|c| c.clone() let:c>
                <button on:click=move |_| filter.update(|f| f.category = c.clone())>{c.clone()}</button>
            </For>
        </div>
    }
}
