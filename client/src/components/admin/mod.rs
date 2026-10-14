use leptos::*;

#[component]
pub fn UploadForm() -> impl IntoView {
    view! {
        <form class="admin-form" method="post" action="/api/admin/products" enctype="multipart/form-data">
            <input name="title" required placeholder="Title"/>
            <input name="price_cents" type="number" required placeholder="Price (cents)"/>
            <input name="category" placeholder="Category (e.g. Dresses)"/>
            <input name="sizes" placeholder="Sizes comma-separated (S,M,L)"/>
            <textarea name="description" placeholder="Description"></textarea>
            <input name="image" type="file" accept="image/*" required/>
            <button class="btn primary" type="submit">"Upload to R2"</button>
        </form>
    }
}
