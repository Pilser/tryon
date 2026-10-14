//! Persistent try-on studio. Embedded panel (never an auto-dismissing
//! popup): explicit buttons only, no overlay-click close. Flow:
//! pick/take photo -> client WASM validate + downscale -> upload person
//! (`imageId`, Genlook keeps it ~7 days) -> `/api/try-on/sync` (200 =
//! result, 202 = poll) -> preview + download.

use leptos::*;
use tryon_shared::{models::Product, photo};
use wasm_bindgen::JsCast;

#[derive(Clone, Copy, PartialEq)]
enum Phase {
    Pick,
    Ready,
    Working,
    Done,
    Failed,
}

async fn read_picked(
    ev: web_sys::Event,
    set_phase: WriteSignal<Phase>,
    set_error: WriteSignal<Option<String>>,
    set_info: WriteSignal<String>,
    set_preview: WriteSignal<Option<String>>,
    set_person: WriteSignal<Option<(Vec<u8>, String)>>,
) {
    let input: web_sys::HtmlInputElement = event_target(&ev);
    let file = input.files().and_then(|l| l.get(0));
    let Some(f) = file else {
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
    let gf = gloo_file::File::from(f);
    match gloo_file::futures::read_as_bytes(&gf).await {
        Err(_) => set_error.set(Some("could not read that file".into())),
        Ok(raw) => match crate::photo::pipe::prepare(raw, &mime) {
            Err(e) => {
                set_error.set(Some(e.to_string()));
                set_phase.set(Phase::Pick);
            }
            Ok(p) => match crate::photo::pipe::preview_url(&p.bytes, &p.mime) {
                Err(e) => set_error.set(Some(e.to_string())),
                Ok(url) => {
                    if let Some(old) = set_preview.get_untracked() {
                        crate::photo::pipe::revoke_url(&old);
                    }
                    let note = if p.processed {
                        format!("resized in-browser to {}x{} (original was hi-res)", p.width, p.height)
                    } else if p.width > 0 {
                        format!("{}x{} · {:.1} MB", p.width, p.height, p.bytes.len() as f64 / 1e6)
                    } else {
                        format!("HEIC original · {:.1} MB (sent as-is)", p.bytes.len() as f64 / 1e6)
                    };
                    set_info.set(note);
                    set_preview.set(Some(url));
                    set_person.set(Some((p.bytes, p.mime)));
                    set_error.set(None);
                    set_phase.set(Phase::Ready);
                }
            },
        },
    }
}

async fn poll_result(generation_id: String, set_progress: WriteSignal<String>) -> Result<String, String> {
    for i in 0..45 {
        gloo_timers::future::sleep(std::time::Duration::from_secs(2)).await;
        set_progress.set(format!("Checking result… ({}s)", (i + 1) * 2));
        let res = gloo_net::http::Request::get(&format!("/api/generations/{generation_id}"))
            .send()
            .await
            .map_err(|_| "network error while polling".to_string())?;
        let v: serde_json::Value = res.json().await.map_err(|_| "bad poll response".to_string())?;
        match v.get("status").and_then(|s| s.as_str()) {
            Some("COMPLETED") => {
                return v
                    .get("resultImageUrl")
                    .and_then(|u| u.as_str())
                    .map(|s| s.to_string())
                    .ok_or_else(|| "missing result image".to_string())
            }
            Some("FAILED") => return Err("generation failed (credit refunded), try another photo".into()),
            _ => continue,
        }
    }
    Err("timed out waiting (~90s). Your generationId is safe — refresh and check again.".into())
}

fn download(url: &str) {
    let url = url.to_string();
    spawn_local(async move {
        let data = match gloo_net::http::Request::get(&url).send().await {
            Ok(r) => r.binary().await.unwrap_or_default(),
            Err(_) => Vec::new(),
        };
        if data.is_empty() {
            return;
        }
        let arr = js_sys::Uint8Array::from(data.as_slice());
        let parts = js_sys::Array::of1(&arr.into());
        let mut bag = web_sys::BlobPropertyBag::new();
        bag.type_("image/jpeg");
        if let Ok(blob) = web_sys::Blob::new_with_u8_array_sequence_and_options(&parts, &bag) {
            if let Ok(obj) = web_sys::Url::create_object_url_with_blob(&blob) {
                if let Some(doc) = web_sys::window().and_then(|w| w.document()) {
                    if let Ok(a) = doc.create_element("a") {
                        let a: web_sys::HtmlAnchorElement = a.unchecked_into();
                        a.set_href(&obj);
                        a.set_download("tryon-result.jpg");
                        a.click();
                    }
                }
            }
        }
    });
}

#[component]
pub fn TryOnStudio(product: Product) -> impl IntoView {
    let (phase, set_phase) = create_signal(Phase::Pick);
    let (error, set_error) = create_signal::<Option<String>>(None);
    let (info, set_info) = create_signal(String::new());
    let (preview, set_preview) = create_signal::<Option<String>>(None);
    let (person, set_person) = create_signal::<Option<(Vec<u8>, String)>>(None);
    let (progress, set_progress) = create_signal(String::new());
    let (result, set_result) = create_signal::<Option<String>>(None);

    let on_file = move |ev| {
        spawn_local(read_picked(ev, set_phase, set_error, set_info, set_preview, set_person));
    };

    let change_photo = move |_| {
        if let Some(old) = set_preview.get_untracked() {
            crate::photo::pipe::revoke_url(&old);
        }
        set_preview.set(None);
        set_person.set(None);
        set_error.set(None);
        set_phase.set(Phase::Pick);
    };

    let start = move |_| {
        let person = set_person.get_untracked();
        let Some((bytes, mime)) = person else {
            set_error.set(Some("pick a photo first".into()));
            return;
        };
        let product = product.clone();
        set_error.set(None);
        set_phase.set(Phase::Working);
        set_progress.set("Uploading photo…".into());
        spawn_local(async move {
            // 1. Person upload -> imageId (Genlook keeps ~7 days).
            let arr = js_sys::Uint8Array::from(bytes.as_slice());
            let parts = js_sys::Array::of1(&arr.into());
            let mut bag = web_sys::BlobPropertyBag::new();
            bag.type_(&mime);
            let blob = match web_sys::Blob::new_with_u8_array_sequence_and_options(&parts, &bag) {
                Ok(b) => b,
                Err(_) => {
                    set_error.set(Some("could not pack photo".into()));
                    set_phase.set(Phase::Ready);
                    return;
                }
            };
            let fd = web_sys::FormData::new().unwrap();
            fd.append_with_blob_and_filename("file", &blob, "person.jpg").unwrap();
            let up = gloo_net::http::Request::post("/api/person-upload")
                .body(&fd)
                .unwrap()
                .send()
                .await;
            let image_id: String = match up {
                Ok(r) => match r.json::<serde_json::Value>().await {
                    Ok(v) => v.get("imageId").and_then(|s| s.as_str()).unwrap_or_default().to_string(),
                    Err(_) => String::new(),
                },
                Err(_) => String::new(),
            };
            if image_id.is_empty() {
                set_error.set(Some("photo upload failed — check size/type and retry".into()));
                set_phase.set(Phase::Ready);
                return;
            }
            // 2. Sync try-on (200 = ready, 202 = poll).
            set_progress.set("Trying it on… (~10s)".into());
            let req = serde_json::json!({
                "product_id": product.id,
                "title": product.title,
                "description": product.description,
                "image_url": product.image_url,
                "person_image_id": image_id,
            });
            let res = gloo_net::http::Request::post("/api/try-on/sync").json(&req).unwrap().send().await;
            let outcome: Result<String, String> = match res {
                Err(_) => Err("network error starting try-on".into()),
                Ok(r) => {
                    let status = r.status();
                    let v: serde_json::Value = r.json().await.unwrap_or_default();
                    if status == 200 {
                        v.get("resultImageUrl")
                            .and_then(|u| u.as_str())
                            .map(|s| s.to_string())
                            .ok_or_else(|| "missing result image".to_string())
                    } else if status == 202 {
                        let gid = v.get("generationId").and_then(|g| g.as_str()).unwrap_or_default().to_string();
                        poll_result(gid, set_progress).await
                    } else {
                        Err(v
                            .get("message")
                            .and_then(|m| m.as_str())
                            .unwrap_or("try-on failed (credit refunded)")
                            .to_string())
                    }
                }
            };
            match outcome {
                Ok(url) => {
                    set_result.set(Some(url));
                    set_phase.set(Phase::Done);
                }
                Err(e) => {
                    set_error.set(Some(e));
                    set_phase.set(Phase::Failed);
                }
            }
        });
    };

    let retry = move |_| {
        set_error.set(None);
        set_phase.set(Phase::Ready);
    };
    let again = move |_| {
        set_result.set(None);
        set_error.set(None);
        set_phase.set(Phase::Ready);
    };

    view! {
        <section class="studio">
            <h2>"Virtual try-on"</h2>
            {move || match phase.get() {
                Phase::Pick => view! {
                    <div class="studio-pick">
                        <p>"Select a clear front-facing photo, or take one now."</p>
                        <label class="btn primary">"Choose photo<input type="file" accept="image/*" hidden on:change=on_file/></label>
                        <label class="btn">"Take photo<input type="file" accept="image/*" capture="user" hidden on:change=on_file/></label>
                        <p class="hint">"JPEG / PNG / WebP / HEIC · max 10 MB · hi-res is auto-resized in your browser"</p>
                    </div>
                }.into_view(),
                Phase::Ready | Phase::Working | Phase::Failed => view! {
                    <div class="studio-review">
                        {move || preview.get().map(|u| view! { <img class="studio-preview" src=u alt="your photo"/> })}
                        <p class="hint">{info.get()}</p>
                        {move || (phase.get() == Phase::Ready).then(|| view! {
                            <div class="row">
                                <button class="btn primary" on:click=start>"Start try-on"</button>
                                <button class="btn" on:click=change_photo>"Change photo"</button>
                            </div>
                        })}
                        {move || (phase.get() == Phase::Working).then(|| view! { <p class="progress">{progress.get()}</p> })}
                        {move || (phase.get() == Phase::Failed).then(|| view! {
                            <div class="row"><button class="btn primary" on:click=retry>"Retry"</button><button class="btn" on:click=change_photo>"Change photo"</button></div>
                        })}
                    </div>
                }.into_view(),
                Phase::Done => view! {
                    <div class="studio-result">
                        {move || result.get().map(|u| {
                            let dl = u.clone();
                            view! {
                                <img class="studio-result-img" src=u alt="try-on result"/>
                                <div class="row">
                                    <button class="btn primary" on:click=move |_| download(&dl)>"Download image"</button>
                                    <button class="btn" on:click=again>"Try again"</button>
                                    <button class="btn" on:click=change_photo>"Change photo"</button>
                                </div>
                                <p class="hint">"Result links expire — download it now to keep it."</p>
                            }
                        })}
                    </div>
                }.into_view(),
            }}
            {move || error.get().map(|e| view! { <p class="error">{e}</p> })}
            <p class="hint">"Limits: " {photo::MAX_BYTES / 1024 / 1024} " MB max · min " {photo::MIN_DIM} "px"</p>
        </section>
    }
}
