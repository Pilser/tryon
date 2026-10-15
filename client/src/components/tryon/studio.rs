//! Persistent try-on studio with timeline. Embedded panel (never an
//! auto-dismissing popup): explicit buttons only. Your person photo's
//! Genlook `imageId` persists in localStorage (~6 days, Genlook TTL is 7),
//! so switching products never forces a re-pick. Every person photo and
//! result lands in a newest-first timeline strip; clicking an entry
//! re-selects it. Flow: pick/take -> WASM validate + downscale -> upload
//! once -> `/api/try-on/sync` (200 = result, 202 = poll) -> preview +
//! download.

use leptos::*;
use tryon_shared::{models::Product, photo, timeline as tl};
use wasm_bindgen::JsCast;

const PERSON_KEY: &str = "tryon.person.v1";

#[derive(Clone, Copy, PartialEq)]
enum Phase {
    Pick,
    Ready,
    Working,
    Done,
    Failed,
}

fn now_secs() -> i64 {
    (js_sys::Date::now() / 1000.0) as i64
}

fn storage() -> Option<web_sys::Storage> {
    web_sys::window()?.local_storage().ok()?
}

fn load_person() -> Option<(String, i64)> {
    let s = storage()?;
    let raw = s.get_item(PERSON_KEY).ok()??;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    Some((v.get("imageId")?.as_str()?.to_string(), v.get("ts")?.as_i64()?))
}

fn save_person(image_id: &str) {
    if let Some(s) = storage() {
        let v = serde_json::json!({"imageId": image_id, "ts": now_secs()});
        let _ = s.set_item(PERSON_KEY, &v.to_string());
    }
}

async fn read_picked(
    ev: web_sys::Event,
    set_phase: WriteSignal<Phase>,
    set_error: WriteSignal<Option<String>>,
    set_info: WriteSignal<String>,
    set_preview: WriteSignal<Option<String>>,
    set_person: WriteSignal<Option<(Vec<u8>, String)>>,
    set_image_id: WriteSignal<Option<String>>,
    push_entry: WriteSignal<Vec<tl::Entry>>,
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
                    set_preview.set(Some(url.clone()));
                    set_person.set(Some((p.bytes, p.mime)));
                    set_image_id.set(None);
                    push_entry.update(|l| {
                        *l = tl::push(l.clone(), tl::Entry {
                            kind: "person".into(),
                            thumb: url,
                            image_id: String::new(),
                            url: String::new(),
                            ts: now_secs(),
                        })
                    });
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

async fn upload_person(bytes: Vec<u8>, mime: String) -> Result<String, String> {
    let arr = js_sys::Uint8Array::from(bytes.as_slice());
    let parts = js_sys::Array::of1(&arr.into());
    let mut bag = web_sys::BlobPropertyBag::new();
    bag.type_(&mime);
    let blob = web_sys::Blob::new_with_u8_array_sequence_and_options(&parts, &bag)
        .map_err(|_| "could not pack photo".to_string())?;
    let fd = web_sys::FormData::new().map_err(|_| "could not pack photo".to_string())?;
    fd.append_with_blob_and_filename("file", &blob, "person.jpg")
        .map_err(|_| "could not pack photo".to_string())?;
    let up = gloo_net::http::Request::post("/api/person-upload")
        .body(&fd)
        .map_err(|_| "network error uploading photo".to_string())?
        .send()
        .await
        .map_err(|_| "photo upload failed — check size/type and retry".to_string())?;
    let v: serde_json::Value = up.json().await.map_err(|_| "photo upload failed".to_string())?;
    v.get("imageId")
        .and_then(|s| s.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .ok_or_else(|| "photo upload failed — check size/type and retry".to_string())
}

#[component]
pub fn TryOnStudio(product: Product) -> impl IntoView {
    let (phase, set_phase) = create_signal(Phase::Pick);
    let (error, set_error) = create_signal::<Option<String>>(None);
    let (info, set_info) = create_signal(String::new());
    let (preview, set_preview) = create_signal::<Option<String>>(None);
    let (person, set_person) = create_signal::<Option<(Vec<u8>, String)>>(None);
    let (image_id, set_image_id) = create_signal::<Option<String>>(None);
    let (entries, set_entries) = create_signal::<Vec<tl::Entry>>(vec![]);
    let (progress, set_progress) = create_signal(String::new());
    let (result, set_result) = create_signal::<Option<String>>(None);

    // Restore saved person photo (imageId only; bytes re-uploaded never again).
    create_effect(move |_| {
        if let Some((id, ts)) = load_person() {
            if now_secs() - ts < tl::PERSON_TTL_SECS && !id.is_empty() {
                set_image_id.set(Some(id));
                set_info.set("Saved photo restored — Start try-on, or Change photo.".into());
                set_phase.set(Phase::Ready);
            }
        }
    });

    let push_entry = set_entries;
    let on_file = move |ev| {
        spawn_local(read_picked(ev, set_phase, set_error, set_info, set_preview, set_person, set_image_id, push_entry));
    };

    let change_photo = move |_| {
        if let Some(old) = set_preview.get_untracked() {
            crate::photo::pipe::revoke_url(&old);
        }
        set_preview.set(None);
        set_person.set(None);
        set_image_id.set(None);
        set_error.set(None);
        set_phase.set(Phase::Pick);
    };

    let select_entry = move |e: tl::Entry| {
        set_error.set(None);
        if e.kind == "person" {
            if e.image_id.is_empty() {
                set_error.set(Some("That photo has no upload yet — pick it again.".into()));
                return;
            }
            set_image_id.set(Some(e.image_id.clone()));
            set_person.set(None);
            set_preview.set(Some(e.thumb.clone()));
            set_info.set("Timeline photo selected.".into());
            set_phase.set(Phase::Ready);
        } else if !e.url.is_empty() {
            set_result.set(Some(e.url.clone()));
            set_phase.set(Phase::Done);
        }
    };

    let start = move |_| {
        let product = product.clone();
        let fresh = set_person.get_untracked();
        let stored = set_image_id.get_untracked();
        if fresh.is_none() && stored.is_none() {
            set_error.set(Some("pick a photo first".into()));
            return;
        }
        set_error.set(None);
        set_phase.set(Phase::Working);
        set_progress.set("Uploading photo…".into());
        spawn_local(async move {
            // Reuse saved/uploaded imageId; upload only fresh bytes once.
            let image_id = match (fresh, stored) {
                (Some((bytes, mime)), _) => {
                    let id = match upload_person(bytes, mime).await {
                        Ok(id) => id,
                        Err(e) => {
                            set_error.set(Some(e));
                            set_phase.set(Phase::Ready);
                            return;
                        }
                    };
                    save_person(&id);
                    set_image_id.set(Some(id.clone()));
                    set_entries.update(|l| {
                        for x in l.iter_mut() {
                            if x.kind == "person" && x.image_id.is_empty() {
                                x.image_id = id.clone();
                            }
                        }
                    });
                    id
                }
                (None, Some(id)) => {
                    set_progress.set("Trying it on… (~10s)".into());
                    id
                }
                (None, None) => unreachable!(),
            };
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
                    set_entries.update(|l| {
                        *l = tl::push(l.clone(), tl::Entry {
                            kind: "result".into(),
                            thumb: url.clone(),
                            image_id: String::new(),
                            url: url.clone(),
                            ts: now_secs(),
                        })
                    });
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
            <h3 class="tl-head">"Your timeline"</h3>
            <div class="tl-row">
                <For each=move || entries.get() key=|e| e.thumb.clone() let:e>
                    <button class="tl-item" on:click=move |_| select_entry(e.clone())>
                        <img src=e.thumb.clone() alt=e.kind.clone()/>
                    </button>
                </For>
            </div>
            <p class="hint">"Limits: " {photo::MAX_BYTES / 1024 / 1024} " MB max · min " {photo::MIN_DIM} "px"</p>
        </section>
    }
}
