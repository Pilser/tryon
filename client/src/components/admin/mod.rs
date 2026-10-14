//! Owner upload with the same photo pipeline as shoppers: camera/file
//! pick -> preview -> WASM validate + downscale -> `POST
//! /api/admin/products` (multipart, Worker stores bytes in R2).

use leptos::*;
use wasm_bindgen::JsCast;

#[component]
pub fn UploadForm() -> impl IntoView {
    let (error, set_error) = create_signal::<Option<String>>(None);
    let (info, set_info) = create_signal(String::new());
    let (preview, set_preview) = create_signal::<Option<String>>(None);
    let (file, set_file) = create_signal::<Option<(Vec<u8>, String)>>(None);
    let (busy, set_busy) = create_signal(false);
    let (done, set_done) = create_signal::<Option<String>>(None);

    let on_file = move |ev: web_sys::Event| {
        let input: web_sys::HtmlInputElement = event_target(&ev);
        let picked = input.files().and_then(|l| l.get(0));
        let Some(f) = picked else {
            return;
        };
        let mime = {
            let t = f.type_();
            if t.is_empty() {
                "image/jpeg".to_string()
            } else {
                t
            }
        };
        spawn_local(async move {
            let gf = gloo_file::File::from(f);
            match gloo_file::futures::read_as_bytes(&gf).await {
                Err(_) => set_error.set(Some("could not read that file".into())),
                Ok(raw) => match crate::photo::pipe::prepare(raw, &mime) {
                    Err(e) => set_error.set(Some(e.to_string())),
                    Ok(p) => match crate::photo::pipe::preview_url(&p.bytes, &p.mime) {
                        Err(e) => set_error.set(Some(e.to_string())),
                        Ok(url) => {
                            if let Some(old) = set_preview.get_untracked() {
                                crate::photo::pipe::revoke_url(&old);
                            }
                            set_info.set(format!(
                                "{}x{} · {:.1} MB{}",
                                p.width,
                                p.height,
                                p.bytes.len() as f64 / 1e6,
                                if p.processed { " · resized in-browser" } else { "" },
                            ));
                            set_preview.set(Some(url));
                            set_file.set(Some((p.bytes, p.mime)));
                            set_error.set(None);
                        }
                    },
                },
            }
        });
    };

    let submit = move |ev: web_sys::SubmitEvent| {
        ev.prevent_default();
        let doc = match web_sys::window().and_then(|w| w.document()) {
            Some(d) => d,
            None => return,
        };
        let val = |id: &str| {
            doc.get_element_by_id(id)
                .and_then(|e| e.dyn_into::<web_sys::HtmlInputElement>().ok())
                .map(|i| i.value())
                .unwrap_or_default()
        };
        let title = val("f-title");
        let price: String = val("f-price");
        let category = val("f-category");
        let sizes = val("f-sizes");
        let desc = doc
            .get_element_by_id("f-desc")
            .and_then(|e| e.dyn_into::<web_sys::HtmlInputElement>().ok())
            .map(|i| i.value())
            .unwrap_or_default();
        let Some((bytes, mime)) = set_file.get_untracked() else {
            set_error.set(Some("pick a product photo first".into()));
            return;
        };
        if title.trim().is_empty() {
            set_error.set(Some("title is required".into()));
            return;
        }
        set_busy.set(true);
        set_error.set(None);
        spawn_local(async move {
            let arr = js_sys::Uint8Array::from(bytes.as_slice());
            let parts = js_sys::Array::of1(&arr.into());
            let mut bag = web_sys::BlobPropertyBag::new();
            bag.type_(&mime);
            let blob = web_sys::Blob::new_with_u8_array_sequence_and_options(&parts, &bag).unwrap();
            let fd = web_sys::FormData::new().unwrap();
            fd.append_with_blob_and_filename("image", &blob, "product.jpg").unwrap();
            fd.append_with_str("title", &title).unwrap();
            fd.append_with_str("price_cents", &price).unwrap();
            fd.append_with_str("category", &category).unwrap();
            fd.append_with_str("sizes", &sizes).unwrap();
            fd.append_with_str("description", &desc).unwrap();
            let res = gloo_net::http::Request::post("/api/admin/products").body(&fd).unwrap().send().await;
            set_busy.set(false);
            match res {
                Ok(r) if r.status() < 300 => {
                    set_done.set(Some("Uploaded — it now appears on the landing grid.".into()));
                    if let Some(old) = set_preview.get_untracked() {
                        crate::photo::pipe::revoke_url(&old);
                    }
                    set_preview.set(None);
                    set_file.set(None);
                    set_info.set(String::new());
                }
                _ => set_error.set(Some("upload failed — retry".into())),
            }
        });
    };

    view! {
        <form class="admin-form" on:submit=submit>
            <div class="row">
                <label class="btn">"Product photo<input type="file" accept="image/*" hidden on:change=on_file/></label>
                <label class="btn">"Take photo<input type="file" accept="image/*" capture="environment" hidden on:change=on_file/></label>
            </div>
            {move || preview.get().map(|u| view! { <img class="admin-preview" src=u alt="product preview"/> })}
            <p class="hint">{info.get()}</p>
            <input id="f-title" placeholder="Title *" required/>
            <input id="f-price" type="number" min="0" placeholder="Price (cents) *"/>
            <input id="f-category" placeholder="Category (e.g. Dresses)"/>
            <input id="f-sizes" placeholder="Sizes comma-separated (S,M,L)"/>
            <input id="f-desc" placeholder="Description (helps the AI fit it right)"/>
            <button class="btn primary" type="submit" disabled=move || busy.get() || file.get().is_none()>
                {move || if busy.get() { "Uploading…" } else { "Upload to R2" }}
            </button>
            {move || error.get().map(|e| view! { <p class="error">{e}</p> })}
            {move || done.get().map(|d| view! { <p class="ok">{d}</p> })}
        </form>
    }
}
