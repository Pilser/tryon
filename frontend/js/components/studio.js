/* components/studio.js — try-on flow. Binds the sacred studio ids.
   Uploads once per photo (imageId persists via core/store), sync-or-poll,
   result + download. Timeline entries pushed here, painted by timeline.js. */
import { tryOnSync, pollGeneration, uploadPerson } from "../core/api.js";
import { nowSecs, savePerson, pushTimeline, loadPerson, personUsable } from "../core/store.js";
import { prepFile, thumbOf } from "./photo.js";
import { paintTimeline } from "./timeline.js";

const $ = (id) => document.getElementById(id);
const show = (el, on) => { el.style.display = on ? "" : "none"; };

export function initStudio(product) {
  let file = null, activeImageId = null;
  const fail = (m) => { $("st-err").textContent = m; show($("st-err"), true); };
  const clear = () => { $("st-err").textContent = ""; show($("st-err"), false); };
  const ready = (thumb, note, welcomed) => {
    $("st-prev").src = thumb; show($("st-prev"), true);
    $("st-meta").textContent = note;
    $("st-welcome").textContent = welcomed ? "Saved photo restored — Start try-on, or Change photo." : "";
    show($("st-welcome"), welcomed);
    show($("st-start"), true); show($("st-change"), true);
  };

  const onPick = async (ev) => {
    clear();
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    try {
      const r = await prepFile(f);
      file = { blob: r.blob, mime: r.mime }; activeImageId = null;
      const u = URL.createObjectURL(r.blob), im = new Image();
      im.onload = () => thumbOf(im, (t) => {
        ready(u, r.note, false);
        savePerson("", t);
        pushTimeline({ kind: "person", thumb: t, imageId: "", url: "", ts: nowSecs() });
        paintTimeline(selectEntry, t);
      });
      im.src = u;
    } catch (e) { fail(e.message); }
  };
  $("pick-file").addEventListener("change", onPick);
  $("pick-cam").addEventListener("change", onPick);
  $("st-change").addEventListener("click", () => {
    file = null; activeImageId = null; $("st-prev").src = "";
    show($("st-prev"), false); show($("st-start"), false); show($("st-change"), false);
    $("st-meta").textContent = ""; show($("st-welcome"), false); clear();
  });

  const selectEntry = (e) => {
    clear();
    if (e.kind === "person") {
      if (!personUsable(e)) return fail("That photo expired — pick a new one.");
      activeImageId = e.imageId; file = null;
      savePerson(e.imageId);
      ready(e.thumb, "Timeline photo selected.", false);
      paintTimeline(selectEntry, e.thumb);
    } else if (e.url) {
      $("st-resimg").src = e.url; show($("st-res"), true);
      paintTimeline(selectEntry, e.thumb);
    }
  };

  $("st-start").addEventListener("click", async () => {
    if (!file && !activeImageId) return fail("Pick a photo first.");
    clear(); show($("st-start"), false);
    $("st-prog").textContent = "Uploading photo…"; show($("st-prog"), true);
    try {
      let imageId = activeImageId;
      if (file) {
        imageId = (await uploadPerson(file.blob)).imageId;
        if (!imageId) throw new Error("no imageId returned");
        activeImageId = imageId;
        savePerson(imageId);
      }
      $("st-prog").textContent = "Trying it on… (about 10 seconds)";
      const { status, body } = await tryOnSync({
        product_id: product.id, title: product.title, description: product.description,
        image_url: product.image_url, person_image_id: imageId,
      });
      let url = null;
      if (status === 200 && body.resultImageUrl) url = body.resultImageUrl;
      else if (status === 202 && body.generationId) {
        url = await pollGeneration(body.generationId, (s) => { $("st-prog").textContent = `Checking result… (${s}s)`; });
      } else throw new Error(body.message || "try-on failed (credit refunded)");
      show($("st-prog"), false);
      $("st-resimg").src = url; show($("st-res"), true);
      pushTimeline({ kind: "result", thumb: url, imageId: "", url, ts: nowSecs() });
      paintTimeline(selectEntry, url);
      $("st-dl").onclick = async () => {
        const b = await (await fetch(url)).blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b); a.download = "tryon-result.jpg"; a.click();
      };
    } catch (e) { show($("st-prog"), false); fail(e.message); show($("st-start"), true); }
  });
  $("st-retry").addEventListener("click", () => { show($("st-res"), false); show($("st-start"), true); clear(); });

  paintTimeline(selectEntry);
  const saved = loadPerson();
  if (personUsable(saved)) {
    activeImageId = saved.imageId;
    ready(saved.thumb || "", "Saved photo restored — no need to re-pick.", true);
  }
}
