/* components/studio.ts - try-on flow. Binds the sacred studio ids.
   Photo is uploaded EAGERLY on pick so the timeline entry is reusable
   at once (imageId patched in when upload lands); Start reuses it.
   Result prepends to timeline top. Pixels via components/photo.ts. */
import { tryOnSync, pollGeneration, uploadPerson, registerDevice, backupPhoto } from "../core/api";
import { capturePhoto } from "./capture";
import { nowSecs, savePerson, pushTimeline, updateTimelineEntry, loadPerson, loadTimeline, personUsable } from "../core/store";
import { savePhoto, loadPhoto, prunePhotos } from "../core/photo-store";
import type { Product, TimelineEntry } from "../core/types";
import { prepFile, thumbOf, previewURL } from "./photo";
import { paintTimeline } from "./timeline";
import { deviceId, fingerprintParts, isSpent, rememberDeviceId, type Allowance } from "../core/device";
import { paintQuota } from "./quota";
import { genWait, type GenWait } from "./wait";
import { logErr } from "../core/log";

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
  let genWaiter: GenWait | null = null; // the one active try-on wait (wait.ts)
  const fail = (m: string): void => { const e = el("st-err"); e.textContent = m; show(e, true); };
  const clear = (): void => { const e = el("st-err"); e.textContent = ""; show(e, false); };
  /* Allowance: server-owned; the banner only appears when nothing is left,
     and the Try-it-on button hides with it (the server would 402 anyway). */
  let spent = false;
  const applyAllowance = (a: Allowance | null, open = false): void => {
    if (!a) return;
    rememberDeviceId(a.device_id);
    spent = isSpent(a);
    // Blocked devices always get the banner (try-ons are paused); spent
    // ones get it collapsed unless they just hit the wall.
    const blocked = !!a.blocked;
    paintQuota(blocked || spent ? a : null, spent, open || blocked);
    const st = document.getElementById("st-start");
    if (st) show(st, !(spent || blocked));
  };
  const refreshAllowance = async (): Promise<void> => {
    try {
      applyAllowance(await registerDevice(deviceId(), fingerprintParts()));
    } catch { /* offline / no D1: try-on still answers with its own error */ }
  };
  void refreshAllowance();
  // The banner reports unlocks/contacts back here so the button and the
  // banner follow one state: the server's allowance.
  document.addEventListener("quota-changed", (ev) => {
    const d = (ev as CustomEvent<{ allowance: Allowance; note?: string }>).detail;
    if (!d?.allowance) return;
    applyAllowance(d.allowance);
    if (!d.note) return;
    const m = el("st-meta");
    m.textContent = d.note;
    window.setTimeout(() => { if (m.textContent === d.note) m.textContent = ""; }, 5000);
  });
  /* Full-quality display source per timeline entry. Ribbon thumbs are
     128px icons (cheap for localStorage); the card must never show one,
     so person photos reload their stored file and results use their URL. */
  const fullByThumb = new Map<string, string>();
  const fullSrc = async (e: TimelineEntry): Promise<string> => {
    const cached = e.thumb ? fullByThumb.get(e.thumb) : undefined;
    if (cached) return cached;
    if (e.photoKey) {
      const blob = await loadPhoto(e.photoKey);
      if (blob) {
        const u = previewURL(blob);
        if (e.thumb) fullByThumb.set(e.thumb, u);
        return u;
      }
    }
    return e.kind === "result" ? e.url || e.thumb : e.thumb;
  };
  /* display = full-quality pixels in the card; thumb = the ribbon icon. */
  const ready = (display: string, thumb = display, scroll = true): void => {
    if (activeFull.startsWith("blob:")) {
      try { URL.revokeObjectURL(activeFull); } catch { /* already gone */ }
    }
    activeThumb = thumb;
    activeFull = display;
    activeKey = thumb;
    (el("st-prev") as HTMLImageElement).src = display; show(el("st-prev"), true);
    const ue = document.getElementById("st-userempty");
    if (ue) show(ue, false);
    const us = document.getElementById("st-usertl");
    if (us) show(us, false);
    el("st-meta").textContent = "";
    if (!spent) show(el("st-start"), true);
    // Bring the user card into view after a fresh pick/tap (never on
    // restore: the page must land on the product card, fully in view).
    if (scroll) {
      const duoEl = document.getElementById("st-duo");
      if (duoEl) duoEl.scrollTo({ left: duoEl.scrollWidth, behavior: "smooth" });
    }
  };
  const stopAnim = (): void => {
    genWaiter?.stop();
    genWaiter = null;
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
        // Back the picked file up to object storage under this device, so
        // the owner can see (and prune) what each device keeps. Best
        // effort: a failed backup never blocks the try-on flow.
        void backupPhoto(deviceId(), r.blob).catch(() => undefined);
        paintTimeline(selectEntry, t);
      })();
      im.src = u;
    } catch (e) { logErr("photo prep", e); fail(e instanceof Error ? e.message : String(e)); }
  };
  const onPick = (ev: Event): void => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (f) void onPickFile(f);
    // Reset the input so picking the same file again still fires change.
    (ev.target as HTMLInputElement).value = "";
  };
  el("pick-file").addEventListener("change", onPick);
  el("pick-cam").addEventListener("change", onPick);
  // Ribbon tiles survive every repaint: one delegated handler per
  // ribbon (main + in-card duplicate), bound once.
  const ribbonActs = (ev: Event): void => {
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
  };
  el("st-timeline").addEventListener("click", ribbonActs);
  document.getElementById("st-usertl")?.addEventListener("click", ribbonActs);

  /* Result display: results feed the USER CARD (the one next to the
     product card) instead of opening a second card below. The card shows
     the newest result; holding it peeks the photo before it (the original)
     and releasing puts the result back on top. */
  const paintResult = (url: string): void => {
    stopAnim();
    show(el("st-res"), false);
    activeThumb = url; activeFull = url; activeKey = url;
    const face = el("st-prev") as HTMLImageElement;
    face.src = url; show(face, true);
    const ue = document.getElementById("st-userempty");
    if (ue) show(ue, false);
    const us = document.getElementById("st-usertl");
    if (us) show(us, false);
    if (!spent) show(el("st-start"), true);
    // Save stays one tap away in its own line (st-meta is reused for
    // hold-to-peek captions, which would wipe a button).
    const saveBox = document.getElementById("st-save");
    if (saveBox) {
      saveBox.innerHTML = "";
      const save = document.createElement("button");
      save.type = "button";
      save.className = "btn secondary";
      save.textContent = "Save photo";
      save.addEventListener("click", () => void (async () => {
        try {
          const b = await (await fetch(url)).blob();
          const a = document.createElement("a");
          a.href = URL.createObjectURL(b); a.download = "tryon-result.jpg"; a.click();
        } catch {
          window.open(url, "_blank", "noopener");
        }
      })());
      saveBox.appendChild(save);
      show(saveBox, true);
    }
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
        // Full-quality pixels: the stored file when we still have it, the
        // 128px ribbon icon only as a last resort.
        ready(await fullSrc(e), e.thumb);
        paintTimeline(selectEntry, e.thumb);
        return;
      }
      const blob = e.photoKey ? await loadPhoto(e.photoKey) : null;
      if (!blob) { fail("That photo is no longer stored - add it again."); return; }
      file = { blob, mime: blob.type || "image/jpeg" }; activeImageId = null;
      show(el("st-res"), false); hideCompare(); stopAnim();
      const full = previewURL(blob);
      if (e.thumb) fullByThumb.set(e.thumb, full);
      ready(full, e.thumb);
      paintTimeline(selectEntry, e.thumb);
    } else if (e.url) {
      // Results feed the user card too: no second card opens below.
      paintResult(e.url);
      paintTimeline(selectEntry, e.thumb);
    }
  })();

  el("st-start").addEventListener("click", () => void (async () => {
    if (!file && !activeImageId) { fail("Pick a photo first."); return; }
    clear(); show(el("st-start"), false);
    // The wait rides on the user photo: spinner + real seconds, relaxing
    // to "took longer than usual - please wait" after 10s (wait.ts).
    const prev = el("st-prev") as HTMLImageElement;
    const prog = el("st-prog");
    genWaiter?.stop();
    genWaiter = genWait(prog, prev);
    genWaiter.phase("Generating");
    show(prog, true);
    try {
      let imageId = activeImageId;
      if (file && !imageId) {
        genWaiter.stop(); // the seconds restart cleanly per stage
        genWaiter = genWait(prog, prev);
        genWaiter.phase("Uploading photo");
        const u = await uploadPerson(file.blob);
        if (!u.imageId) throw new Error("no imageId returned");
        imageId = activeImageId = u.imageId;
        savePerson(u.imageId, activeKey);
        if (activeKey) updateTimelineEntry(activeKey, { imageId: u.imageId });
        paintTimeline(selectEntry, activeThumb);
      }
      genWaiter.stop();
      genWaiter = genWait(prog, prev);
      genWaiter.phase("Generating");
      show(prog, true);
      const { status, body } = await tryOnSync({
        product_id: product.id, title: product.title, description: product.description,
        image_url: product.image_url, person_image_id: imageId as string,
        device_id: deviceId(),
      });
      if (status === 402) {
        // Free tries spent: surface the unlock banner instead of an error
        // line (the body carries the allowance snapshot from the server).
        stopAnim(); show(el("st-prog"), false);
        applyAllowance(body as unknown as Allowance, true);
        fail(body.message || "Free try-ons used up - unlock more below.");
        return;
      }
      let url: string | null = null;
      // The generation id arrives either on 202 (pending) or, when the
      // sync path ran out of time (GENERATION_TIMEOUT), inside
      // `details.generationId` — Genlook keeps generating, so poll it
      // instead of failing over a completed image.
      const gid = body.generationId || body.details?.generationId;
      if (status === 200 && body.resultImageUrl) url = body.resultImageUrl;
      else if (gid) {
        url = await pollGeneration(gid, () => genWaiter?.phase("Checking result"));
      } else throw new Error(body.message || "try-on failed (credit refunded)");
      stopAnim(); show(el("st-prog"), false);
      // The result feeds the user card (hold = original, release = result)
      // and goes first in the ribbon; no second card opens below.
      pushTimeline({ kind: "result", thumb: url, imageId: "", url, ts: nowSecs() });
      paintResult(url);
      paintTimeline(selectEntry, url);
      // One try-on is gone server-side; refresh so the banner shows on the
      // last free try and the button hides when nothing is left.
      void refreshAllowance();
    } catch (e) {
      logErr("try-on", e);
      stopAnim(); show(el("st-prog"), false);
      fail(e instanceof Error ? e.message : String(e));
      if (!spent) show(el("st-start"), true);
    }
  })());
  el("st-retry").addEventListener("click", () => {
    show(el("st-res"), false); hideCompare(); clear();
    if (!spent) show(el("st-start"), true);
  });

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
        if (!cand) return;
        // Prefer the full-quality cached pixels over the ribbon icon.
        const src = fullByThumb.get(cand.thumb) || (cand.kind === "person" ? cand.thumb : cand.url);
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
    activeImageId = (saved as { imageId?: string }).imageId || null;
    const thumb = (saved as { thumb?: string }).thumb || "";
    const entry = loadTimeline().find((x) => (x.imageId && x.imageId === activeImageId) || (thumb && x.thumb === thumb));
    // The photo can be restored from this browser while the server never
    // saw it (picked, not yet uploaded): keep its blob so Start uploads it
    // instead of claiming "Pick a photo first" over a visible photo.
    if (!activeImageId && entry?.photoKey) {
      void loadPhoto(entry.photoKey).then((blob) => {
        if (blob) file = { blob, mime: blob.type || "image/jpeg" };
      }).catch(() => undefined);
    }
    // Restore at full quality (the stored file), not the ribbon icon.
    void (async () => {
      const src = entry ? await fullSrc(entry) : thumb;
      ready(src, thumb || src, false);
    })();
  } else {
    // No photo yet: reveal the in-card duplicate ribbon.
    const us = document.getElementById("st-usertl");
    if (us) show(us, true);
  }
}
