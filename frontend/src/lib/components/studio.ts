/* components/studio.ts — try-on flow. Binds the sacred studio ids.
   Photo is uploaded EAGERLY on pick so the timeline entry is reusable
   at once (imageId patched in when upload lands); Start reuses it.
   Result prepends to timeline top. Pixels via components/photo.ts. */
import { tryOnSync, pollGeneration, uploadPerson } from "../core/api";
import { nowSecs, savePerson, pushTimeline, updateTimelineEntry, loadPerson, personUsable } from "../core/store";
import type { Product, TimelineEntry } from "../core/types";
import { prepFile, thumbOf, previewURL } from "./photo";
import { paintTimeline } from "./timeline";

function el(id: string): HTMLElement {
  const n = document.getElementById(id);
  if (!n) throw new Error("missing #" + id);
  return n;
}
const show = (e: HTMLElement, on: boolean): void => { e.style.display = on ? "" : "none"; };

export function initStudio(product: Product): void {
  let file: { blob: Blob; mime: string } | null = null;
  let activeImageId: string | null = null;
  let activeThumb = "";
  const fail = (m: string): void => { const e = el("st-err"); e.textContent = m; show(e, true); };
  const clear = (): void => { const e = el("st-err"); e.textContent = ""; show(e, false); };
  const ready = (thumb: string, note: string, welcomed: boolean): void => {
    activeThumb = thumb;
    (el("st-prev") as HTMLImageElement).src = thumb; show(el("st-prev"), true);
    el("st-meta").textContent = note;
    el("st-welcome").textContent = welcomed ? "Saved photo restored — Start try-on, or Change photo." : "";
    show(el("st-welcome"), welcomed);
    show(el("st-start"), true); show(el("st-change"), true);
  };

  const onPick = async (ev: Event): Promise<void> => {
    clear();
    const input = ev.target as HTMLInputElement;
    const f = input.files && input.files[0];
    if (!f) return;
    try {
      const r = await prepFile(f);
      file = { blob: r.blob, mime: r.mime }; activeImageId = null;
      const u = previewURL(r.blob);
      const im = new Image();
      im.onload = () => thumbOf(im, (t) => {
        ready(u, r.note + " · uploading…", false);
        savePerson("", t);
        pushTimeline({ kind: "person", thumb: t, imageId: "", url: "", ts: nowSecs() });
        paintTimeline(selectEntry, t);
        // Eager upload: timeline photo becomes reusable without Start.
        void uploadPerson(file!.blob).then((up) => {
          if (!up.imageId) throw new Error("no imageId returned");
          activeImageId = up.imageId;
          savePerson(up.imageId, t);
          updateTimelineEntry(t, { imageId: up.imageId });
          el("st-meta").textContent = r.note + " · saved, reusable ~6 days";
          paintTimeline(selectEntry, t);
        }).catch((e) => fail("Picked, but upload failed — retry Start: " + (e instanceof Error ? e.message : String(e))));
      });
      im.src = u;
    } catch (e) { fail(e instanceof Error ? e.message : String(e)); }
  };
  el("pick-file").addEventListener("change", (ev) => void onPick(ev));
  el("pick-cam").addEventListener("change", (ev) => void onPick(ev));
  el("st-change").addEventListener("click", () => {
    file = null; activeImageId = null;
    (el("st-prev") as HTMLImageElement).src = "";
    show(el("st-prev"), false); show(el("st-start"), false); show(el("st-change"), false);
    el("st-meta").textContent = ""; show(el("st-welcome"), false); clear();
  });

  const selectEntry = (e: TimelineEntry): void => {
    clear();
    if (e.kind === "person") {
      if (!personUsable(e)) { fail("That photo expired — pick a new one."); return; }
      activeImageId = e.imageId; file = null;
      savePerson(e.imageId);
      ready(e.thumb, "Timeline photo selected.", false);
      paintTimeline(selectEntry, e.thumb);
    } else if (e.url) {
      (el("st-resimg") as HTMLImageElement).src = e.url; show(el("st-res"), true);
      paintTimeline(selectEntry, e.thumb);
    }
  };

  el("st-start").addEventListener("click", () => void (async () => {
    if (!file && !activeImageId) { fail("Pick a photo first."); return; }
    clear(); show(el("st-start"), false);
    el("st-prog").textContent = "Uploading photo…"; show(el("st-prog"), true);
    try {
      let imageId = activeImageId;
      if (file && !imageId) {
        const u = await uploadPerson(file.blob);
        if (!u.imageId) throw new Error("no imageId returned");
        imageId = activeImageId = u.imageId;
        savePerson(u.imageId, activeThumb);
        if (activeThumb) updateTimelineEntry(activeThumb, { imageId: u.imageId });
      }
      el("st-prog").textContent = "Trying it on… (about 10 seconds)";
      const { status, body } = await tryOnSync({
        product_id: product.id, title: product.title, description: product.description,
        image_url: product.image_url, person_image_id: imageId as string,
      });
      let url: string | null = null;
      if (status === 200 && body.resultImageUrl) url = body.resultImageUrl;
      else if (status === 202 && body.generationId) {
        url = await pollGeneration(body.generationId, (s) => { el("st-prog").textContent = `Checking result… (${s}s)`; });
      } else throw new Error(body.message || "try-on failed (credit refunded)");
      show(el("st-prog"), false);
      (el("st-resimg") as HTMLImageElement).src = url; show(el("st-res"), true);
      pushTimeline({ kind: "result", thumb: url, imageId: "", url, ts: nowSecs() });
      paintTimeline(selectEntry, url);
      el("st-dl").onclick = () => void (async () => {
        const b = await (await fetch(url as string)).blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b); a.download = "tryon-result.jpg"; a.click();
      })();
    } catch (e) { show(el("st-prog"), false); fail(e instanceof Error ? e.message : String(e)); show(el("st-start"), true); }
  })());
  el("st-retry").addEventListener("click", () => { show(el("st-res"), false); show(el("st-start"), true); clear(); });

  paintTimeline(selectEntry);
  const saved = loadPerson();
  if (personUsable(saved)) {
    activeImageId = (saved as { imageId: string }).imageId;
    ready((saved as { thumb?: string }).thumb || "", "Saved photo restored — no need to re-pick.", true);
  }
}
