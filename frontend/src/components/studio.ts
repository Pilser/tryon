/* components/studio.ts - try-on flow. Binds the sacred studio ids.
   Photo is uploaded EAGERLY on pick so the timeline entry is reusable
   at once (imageId patched in when upload lands); Start reuses it.
   Result prepends to timeline top. Pixels via components/photo.ts. */
import { tryOnSync, pollGeneration, uploadPerson } from "../core/api";
import { capturePhoto } from "./capture";
import { nowSecs, savePerson, pushTimeline, updateTimelineEntry, loadPerson, loadTimeline, personUsable } from "../core/store";
import { savePhoto, loadPhoto, prunePhotos } from "../core/photo-store";
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
  let activeFull = "";
  let activeKey = "";
  let animTimer: number | null = null;
  const fail = (m: string): void => { const e = el("st-err"); e.textContent = m; show(e, true); };
  const clear = (): void => { const e = el("st-err"); e.textContent = ""; show(e, false); };
  const ready = (src: string, key: string, scroll = true): void => {
    if (activeFull.startsWith("blob:")) {
      try { URL.revokeObjectURL(activeFull); } catch { /* already gone */ }
    }
    activeThumb = src;
    activeFull = src;
    activeKey = key;
    (el("st-prev") as HTMLImageElement).src = src; show(el("st-prev"), true);
    const ue = document.getElementById("st-userempty");
    if (ue) show(ue, false);
    el("st-meta").textContent = "";
    show(el("st-start"), true);
    // Bring the user card into view after a fresh pick/tap (never on
    // restore: the page must land on the product card, fully in view).
    if (scroll) {
      const duoEl = document.getElementById("st-duo");
      if (duoEl) duoEl.scrollTo({ left: duoEl.scrollWidth, behavior: "smooth" });
    }
  };
  const stopAnim = (): void => {
    if (animTimer !== null) { clearInterval(animTimer); animTimer = null; }
    (el("st-prev") as HTMLImageElement).style.opacity = "";
  };

  const onPickFile = async (f: File): Promise<void> => {
    clear();
    try {
      const r = await prepFile(f);
      const u = previewURL(r.blob);
      const im = new Image();
      im.onload = () => void (async () => {
        // No upload yet: it waits for Start. The file is stored in this
        // browser only, so the ribbon photo survives reloads.
        const t = await new Promise<string>((resolve) => thumbOf(im, resolve));
        const key = "p-" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
        await savePhoto(key, r.blob);
        file = { blob: r.blob, mime: r.mime }; activeImageId = null;
        show(el("st-res"), false); hideCompare();
        ready(u, t);
        pushTimeline({ kind: "person", thumb: t, imageId: "", url: "", ts: nowSecs(), photoKey: key });
        paintTimeline(selectEntry, t);
      })();
      im.src = u;
    } catch (e) { fail(e instanceof Error ? e.message : String(e)); }
  };
  const onPick = (ev: Event): void => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (f) void onPickFile(f);
    // Reset the input so picking the same file again still fires change.
    (ev.target as HTMLInputElement).value = "";
  };
  el("pick-file").addEventListener("change", onPick);
  el("pick-cam").addEventListener("change", onPick);
  // Ribbon tiles survive every repaint: one delegated handler, bound once.
  el("st-timeline").addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest("[data-act]") as HTMLElement | null;
    if (!b) return;
    ev.preventDefault();
    void (async () => {
      if (b.dataset.act === "take") {
        const f = await capturePhoto();
        if (f) await onPickFile(f);
        else (el("pick-cam") as HTMLInputElement).click();
      } else {
        (el("pick-file") as HTMLInputElement).click();
      }
    })();
  });

  /* Before/after compare: result stacked over the user photo in one
     frame. Hold (or tap) the top image to reveal the original photo
     underneath; release (or tap again) to return to the result. */
  const paintCompare = (orig: string, result: string): void => {
    const frame = document.getElementById("st-cmp");
    const baseImg = document.getElementById("st-cmp-base") as HTMLImageElement | null;
    const topImg = document.getElementById("st-cmp-top") as HTMLImageElement | null;
    const cap = document.getElementById("st-cmp-cap");
    const single = document.getElementById("st-resimg") as HTMLImageElement | null;
    if (!frame || !baseImg || !topImg) {
      if (single) { single.src = result; show(single, true); }
      return;
    }
    if (!orig) {
      show(frame, false);
      if (cap) show(cap, false);
      if (single) { single.src = result; show(single, true); }
      return;
    }
    if (single) show(single, false);
    baseImg.src = orig; topImg.src = result;
    show(frame, true);
    let pinned = false;
    const capOff = "Your result - hold or tap the photo to see your original.";
    const capOn = "Your original photo - release or tap for the result.";
    const paint = (on: boolean): void => {
      topImg.style.opacity = on ? "0" : "";
      if (cap) { cap.textContent = on ? capOn : capOff; show(cap, true); }
    };
    paint(false);
    topImg.onpointerdown = (e) => { e.preventDefault(); paint(true); };
    topImg.onpointerup = () => paint(pinned);
    topImg.onpointercancel = () => paint(pinned);
    topImg.onpointerleave = () => paint(pinned);
    topImg.onclick = () => { pinned = !pinned; paint(pinned); };
    topImg.oncontextmenu = (e) => e.preventDefault();
  };
  const hideCompare = (): void => {
    const c = document.getElementById("st-cmp");
    if (c) show(c, false);
    const cc = document.getElementById("st-cmp-cap");
    if (cc) show(cc, false);
  };

  const selectEntry = (e: TimelineEntry): void => void (async () => {
    clear();
    if (e.kind === "person") {
      // Whatever the user taps replaces the photo. Uploaded entries reuse
      // their imageId; other entries reload their stored file (no upload yet).
      if (e.imageId) {
        if (!personUsable(e)) { fail("That photo expired - pick a new one."); return; }
        activeImageId = e.imageId; file = null;
        savePerson(e.imageId, e.thumb);
        show(el("st-res"), false); hideCompare(); stopAnim();
        ready(e.thumb, e.thumb);
        paintTimeline(selectEntry, e.thumb);
        return;
      }
      const blob = e.photoKey ? await loadPhoto(e.photoKey) : null;
      if (!blob) { fail("That photo is no longer stored - add it again."); return; }
      file = { blob, mime: blob.type || "image/jpeg" }; activeImageId = null;
      show(el("st-res"), false); hideCompare(); stopAnim();
      ready(previewURL(blob), e.thumb);
      paintTimeline(selectEntry, e.thumb);
    } else if (e.url) {
      (el("st-resimg") as HTMLImageElement).src = e.url; show(el("st-res"), true);
      paintTimeline(selectEntry, e.thumb);
    }
  })();

  el("st-start").addEventListener("click", () => void (async () => {
    if (!file && !activeImageId) { fail("Pick a photo first."); return; }
    clear(); show(el("st-start"), false);
    // Processing animation on the added image while the try-on runs.
    const prev = el("st-prev") as HTMLImageElement;
    const prog = el("st-prog");
    let dots = 0;
    prev.style.opacity = ".45";
    prog.textContent = "Processing your photo";
    show(prog, true);
    animTimer = window.setInterval(() => {
      dots = (dots + 1) % 4;
      prog.textContent = "Processing your photo" + ".".repeat(dots);
      prev.style.opacity = prev.style.opacity === ".45" ? ".75" : ".45";
    }, 450);
    try {
      let imageId = activeImageId;
      if (file && !imageId) {
        prog.textContent = "Uploading photo";
        const u = await uploadPerson(file.blob);
        if (!u.imageId) throw new Error("no imageId returned");
        imageId = activeImageId = u.imageId;
        savePerson(u.imageId, activeKey);
        if (activeKey) updateTimelineEntry(activeKey, { imageId: u.imageId });
        paintTimeline(selectEntry, activeThumb);
      }
      prog.textContent = "Trying it on (about 10 seconds)";
      const { status, body } = await tryOnSync({
        product_id: product.id, title: product.title, description: product.description,
        image_url: product.image_url, person_image_id: imageId as string,
      });
      let url: string | null = null;
      if (status === 200 && body.resultImageUrl) url = body.resultImageUrl;
      else if (status === 202 && body.generationId) {
        url = await pollGeneration(body.generationId, (s) => { prog.textContent = `Checking result (${s}s)`; });
      } else throw new Error(body.message || "try-on failed (credit refunded)");
      stopAnim(); show(el("st-prog"), false);
      // The processed photo replaces the old one; the result also goes
      // first in the ribbon, so the photo behind it is the before view.
      prev.src = url; show(el("st-res"), true);
      paintCompare(activeFull, url);
      pushTimeline({ kind: "result", thumb: url, imageId: "", url, ts: nowSecs() });
      paintTimeline(selectEntry, url);
      el("st-dl").onclick = () => void (async () => {
        try {
          const b = await (await fetch(url as string)).blob();
          const a = document.createElement("a");
          a.href = URL.createObjectURL(b); a.download = "tryon-result.jpg"; a.click();
        } catch {
          window.open(url as string, "_blank", "noopener");
        }
      })();
    } catch (e) { stopAnim(); show(el("st-prog"), false); fail(e instanceof Error ? e.message : String(e)); show(el("st-start"), true); }
  })());
  el("st-retry").addEventListener("click", () => { show(el("st-res"), false); hideCompare(); show(el("st-start"), true); clear(); });

  // User-photo card gestures: tap toggles full (uncropped) view, hold peeks
  // the previous ribbon photo, release returns. Mirrors the product card.
  const face = document.getElementById("st-prev") as HTMLImageElement | null;
  if (face) {
    face.draggable = false;
    let peekTimer: number | null = null, peeking = false, heldFace = false, savedSrc = "";
    face.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      peekTimer = window.setTimeout(() => {
        const cand = loadTimeline().find((x) =>
          x.thumb && x.thumb !== activeKey && (x.kind === "person" ? x.thumb : x.url));
        const src = cand ? (cand.kind === "person" ? cand.thumb : cand.url) : "";
        if (!src) return;
        peeking = true; heldFace = true; savedSrc = face.src; face.src = src;
        el("st-meta").textContent = "Previous photo - release to return.";
      }, 300);
    });
    const endPeek = (): void => {
      if (peekTimer !== null) { clearTimeout(peekTimer); peekTimer = null; }
      if (peeking) {
        peeking = false; face.src = savedSrc; el("st-meta").textContent = "";
      }
    };
    face.addEventListener("pointerup", endPeek);
    face.addEventListener("pointercancel", endPeek);
    face.addEventListener("pointerleave", endPeek);
    face.addEventListener("click", () => {
      if (heldFace) { heldFace = false; return; }
      face.style.objectFit = face.style.objectFit === "contain" ? "" : "contain";
    });
    face.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  paintTimeline(selectEntry);
  // Drop stored files whose timeline entries are gone (cap evictions).
  void prunePhotos(new Set(
    loadTimeline().map((x) => x.photoKey).filter((k): k is string => !!k)
  ));
  const saved = loadPerson();
  if (personUsable(saved) && document.getElementById("st-prev")) {
    activeImageId = (saved as { imageId: string }).imageId;
    ready(((saved as { thumb?: string }).thumb || ""), ((saved as { thumb?: string }).thumb || ""), false);
  }
}
