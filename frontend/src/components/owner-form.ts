/* components/owner-form.ts - 3-slot bundle upload (owner section of
   studio page). Slot tap picks that slot's photo; previews + validation
   inline; styled slot also accepts the latest try-on result; submit posts
   multipart with the saved owner token. */
import { createProduct, listProducts, ownerLogin, ownerLogout, listCategories, createCategory, getShop, saveShop } from "../core/api";
import { capturePhoto } from "./capture";
import { esc, brandHTML, toMinor, toMajor } from "../core/format";
import { currencyOptions, currencyInfo, DEFAULT_CURRENCY } from "../core/currencies";
import { loadOwner, saveOwner, loadTimeline } from "../core/store";
import type { Product } from "../core/types";
import { skin } from "../skin";

function el(id: string): HTMLElement {
  const n = document.getElementById(id);
  if (!n) throw new Error("missing #" + id);
  return n;
}
const show = (e: HTMLElement, on: boolean): void => { e.style.display = on ? "" : "none"; };

export function initOwnerForm(): void {
  const fail = (m: string): void => { el("bd-err").textContent = m; show(el("bd-err"), true); };
  const loginBox = document.getElementById("owner-login");
  const panel = document.getElementById("owner-panel");
  const gated = !!(loginBox && panel);
  const showPanel = (on: boolean): void => {
    if (!gated) return;
    show(loginBox as HTMLElement, !on); show(panel as HTMLElement, on);
  };
  const loginFail = (m: string): void => { el("bd-login-err").textContent = m; show(el("bd-login-err"), true); };
  const refresh = async (): Promise<void> => {
    if (!gated) return;
    const t = loadOwner();
    if (t) {
      try { await ownerLogin(t); showPanel(true); return; }
      catch { saveOwner(""); }
    }
    showPanel(false);
  };
  document.getElementById("bd-login")?.addEventListener("click", () => void (async () => {
    const input = document.getElementById("bd-token") as HTMLInputElement | null;
    const t = (input?.value || "").trim();
    if (!t) { loginFail("Enter your owner token."); return; }
    try {
      await ownerLogin(t);
      saveOwner(t); showPanel(true);
      el("bd-ok").textContent = "Logged in - add products below.";
      show(el("bd-ok"), true);
      const se = document.getElementById("st-edit") as HTMLButtonElement | null;
      if (se) se.style.display = "";
    } catch { loginFail("Wrong token - try again."); }
  })());
  document.getElementById("bd-logout")?.addEventListener("click", () => void (async () => {
    await ownerLogout();
    saveOwner("");
    const input = document.getElementById("bd-token") as HTMLInputElement | null;
    if (input) input.value = "";
    showPanel(false);
  })());
  { // Categories: create with title + image, pick one for the bundle,
    // or edit an existing one (dropdown loads its picture for update).
    let editingCat = "";
    const catImg = () => document.getElementById("bd-cat-img") as HTMLImageElement | null;
    const loadCats = async (): Promise<void> => {
      const box = document.getElementById("bd-cat-list");
      const sel = document.getElementById("bd-cat") as HTMLSelectElement | null;
      const edit = document.getElementById("bd-cat-edit") as HTMLSelectElement | null;
      if (!box || !sel) return;
      const keep = sel.value;
      const cats = await listCategories();
      // Managed first, then any product-only categories, so the select
      // always lists every category in the shop.
      const titles = cats.map((c) => c.title);
      try {
        for (const p of await listProducts()) {
          const t = (p.category || "").trim();
          if (t && !titles.some((x) => x.toLowerCase() === t.toLowerCase())) titles.push(t);
        }
      } catch { /* products optional here */ }
      sel.innerHTML = `<option value="">Others</option>` + titles.map((t) =>
        `<option value="${esc(t)}">${esc(t)}</option>`).join("");
      if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
      if (edit) {
        const ekeep = edit.value;
        edit.innerHTML = `<option value="">Edit existing…</option>` + cats.map((c) =>
          `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join("");
        if ([...edit.options].some((o) => o.value === ekeep)) edit.value = ekeep;
        else { editingCat = ""; syncCatBtn(); }
      }
      box.innerHTML = cats.map((c) =>
        `<span class="cat-chip"><img class="cat-chip-img" src="${esc(c.image_url)}" alt=""/><span>${esc(c.title)}</span></span>`).join("")
        || `<p class="hint">No categories yet - add one above.</p>`;
      skin(box);
    };
    const syncCatBtn = (): void => {
      const b = document.getElementById("bd-cat-add") as HTMLButtonElement | null;
      if (b) b.textContent = editingCat ? "Save" : "Add";
    };
    const exitCatEdit = (): void => {
      editingCat = "";
      const title = document.getElementById("bd-cat-title") as HTMLInputElement | null;
      if (title) title.value = "";
      const file = document.getElementById("bd-cat-file") as HTMLInputElement | null;
      if (file) file.value = "";
      const img = catImg();
      if (img) { img.removeAttribute("src"); show(img, false); }
      syncCatBtn();
    };
    document.getElementById("bd-cat-edit")?.addEventListener("change", (ev) => void (async () => {
      const id = (ev.target as HTMLSelectElement).value;
      editingCat = id;
      const title = document.getElementById("bd-cat-title") as HTMLInputElement | null;
      const img = catImg();
      if (!id) { if (title) title.value = ""; if (img) show(img, false); syncCatBtn(); return; }
      const cat = (await listCategories()).find((c) => c.id === id);
      if (title) title.value = cat ? cat.title : "";
      if (img && cat?.image_url) { img.src = cat.image_url; show(img, true); }
      syncCatBtn();
    })());
    document.getElementById("bd-cat-file")?.addEventListener("change", (ev) => {
      const f = (ev.target as HTMLInputElement).files?.[0];
      const img = catImg();
      if (f && img) { img.src = URL.createObjectURL(f); show(img, true); }
    });
    document.getElementById("bd-cat-add")?.addEventListener("click", () => void (async () => {
      const title = ((document.getElementById("bd-cat-title") as HTMLInputElement | null)?.value || "").trim();
      const file = (document.getElementById("bd-cat-file") as HTMLInputElement | null)?.files?.[0];
      if (!title) { fail("Category title is required."); return; }
      if (!editingCat && !file) { fail("Category image is required."); return; }
      const fd = new FormData();
      if (editingCat) fd.set("id", editingCat);
      fd.set("title", title);
      if (file) fd.set("image", file);
      try {
        await createCategory(fd, loadOwner());
        exitCatEdit();
        const edit = document.getElementById("bd-cat-edit") as HTMLSelectElement | null;
        if (edit) edit.value = "";
        await loadCats();
        window.dispatchEvent(new Event("cats-changed"));
      } catch (e) { fail(e instanceof Error ? e.message : String(e)); }
    })());
    void loadCats();
  }
  { // Shop card: name + logo shown in the navbar brand; currency is the
    // shop default for every new bundle; owner WhatsApp feeds Inquire.
    const paintCur = (name: string, logo: string): void => {
      const box = document.getElementById("bd-shop-cur");
      if (!box) return;
      box.innerHTML = logo
        ? `<span class="cat-chip"><img class="cat-chip-img" src="${esc(logo)}" alt=""/><span>${esc(name)}</span></span>`
        : `<p class="hint">No logo yet - name only.</p>`;
      skin(box);
    };
    const priceBox = () => document.getElementById("bd-price") as HTMLInputElement | null;
    const paintPriceHint = (code: string): void => {
      const p = priceBox();
      if (p) p.placeholder = `Price (${currencyInfo(code).code}) *`;
    };
    const fillCurrency = (code: string): void => {
      const bundle = document.getElementById("bd-currency") as HTMLSelectElement | null;
      if (bundle) bundle.innerHTML = currencyOptions(code);
      const shopSel = document.getElementById("bd-shop-currency") as HTMLSelectElement | null;
      if (shopSel) shopSel.innerHTML = currencyOptions(code);
      paintPriceHint(code);
    };
    fillCurrency(DEFAULT_CURRENCY);
    document.getElementById("bd-currency")?.addEventListener("change", (ev) =>
      paintPriceHint((ev.target as HTMLSelectElement).value));
    void (async () => {
      try {
        const s = await getShop();
        const name = document.getElementById("bd-shop-name") as HTMLInputElement | null;
        if (name && !name.value) name.value = s.shop_name || "";
        const wa = document.getElementById("bd-shop-wa") as HTMLInputElement | null;
        if (wa && !wa.value) wa.value = s.owner_whatsapp || "";
        fillCurrency(s.currency || DEFAULT_CURRENCY);
        paintCur(s.shop_name || "", s.logo_url || "");
      } catch { /* shop optional here */ }
    })();
    document.getElementById("bd-shop-logo")?.addEventListener("change", (ev) => {
      const f = (ev.target as HTMLInputElement).files?.[0];
      if (!f) return;
      const box = document.getElementById("bd-shop-cur");
      if (!box) return;
      box.innerHTML = `<span class="cat-chip"><img class="cat-chip-img" src="${URL.createObjectURL(f)}" alt=""/><span>New logo - Save to keep</span></span>`;
      skin(box);
    });
    document.getElementById("bd-shop-save")?.addEventListener("click", () => void (async () => {
      const name = ((document.getElementById("bd-shop-name") as HTMLInputElement | null)?.value || "").trim();
      const wa = ((document.getElementById("bd-shop-wa") as HTMLInputElement | null)?.value || "").trim();
      const cur = (document.getElementById("bd-shop-currency") as HTMLSelectElement | null)?.value || DEFAULT_CURRENCY;
      const file = (document.getElementById("bd-shop-logo") as HTMLInputElement | null)?.files?.[0];
      if (!name && !file) { fail("Enter a shop name or pick a logo."); return; }
      const fd = new FormData();
      if (name) fd.set("shop_name", name);
      fd.set("owner_whatsapp", wa);
      fd.set("currency", cur);
      if (file) fd.set("logo", file);
      try {
        const s = await saveShop(fd, loadOwner());
        paintCur(s.shop_name, s.logo_url || "");
        fillCurrency(s.currency || DEFAULT_CURRENCY);
        const brand = document.querySelector(".brand");
        if (brand) brand.innerHTML = brandHTML(s);
        el("bd-ok").textContent = "Shop saved - navbar updated.";
        show(el("bd-ok"), true);
      } catch (e) { fail(e instanceof Error ? e.message : String(e)); }
    })());
  }
  { // Styled slot from latest try-on result (fetched to a File on save).
    // Lives inside the styled box; stop the label from opening the picker.
    document.getElementById("bd-use-result")?.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const last = loadTimeline().find((e) => e.kind === "result" && e.url);
      if (!last) { fail("No try-on result yet - run one above first."); return; }
      const img = el("slot-img-2") as HTMLImageElement;
      img.src = last.url; show(img, true);
      img.dataset.genUrl = last.url;
      el("bd-ok").textContent = "Styled photo set from your last try-on.";
      show(el("bd-ok"), true);
    });
  }
  // In-box slot actions: empty boxes show take/select (+ ribbon on
  // styled); filled boxes keep library + camera badges so the photo can
  // be changed or retaken. Buttons carry explicit handlers: clicks on
  // nested buttons must not rely on label forwarding.
  const paintSlot = (i: number): void => {
    const filled = (el("slot-img-" + i) as HTMLImageElement).style.display !== "none";
    show(el("slot-empty-" + i), !filled);
    document.querySelectorAll(`.slot-retake[data-i="${i}"]`).forEach((b) => show(b as HTMLElement, filled));
    document.querySelectorAll(`.slot-relib[data-i="${i}"]`).forEach((b) => show(b as HTMLElement, filled));
    if (i === 2) {
      const u = document.getElementById("bd-use-result");
      if (u) show(u, !filled);
    }
  };
  const feedFile = (i: number, f: File): void => {
    void (async () => {
      try {
        const { normalizeHeicFile } = await import("heic-normalize");
        f = await normalizeHeicFile(f);
      } catch {
        /* keep the original file on normalizer failure */
      }
      if (f.size > 10 * 1024 * 1024) { fail(`Photo ${i + 1} over 10 MB.`); return; }
      const img = el("slot-img-" + i) as HTMLImageElement;
      img.src = URL.createObjectURL(f); show(img, true);
      const dt = new DataTransfer(); dt.items.add(f);
      (el("file" + i) as HTMLInputElement).files = dt.files;
      paintSlot(i);
    })();
  };
  const onSlotFile = (i: number) => (ev: Event): void => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    feedFile(i, f);
  };
  // Desktop webcam modal, native camera sheet on mobile, file fallback.
  const takePhoto = (i: number): void => {
    void (async () => {
      const f = await capturePhoto();
      if (f) feedFile(i, f);
      else (el("filecam" + i) as HTMLInputElement).click();
    })();
  };
  [0, 1, 2].forEach((i) => {
    (el("file" + i) as HTMLInputElement).addEventListener("change", onSlotFile(i));
    (el("filecam" + i) as HTMLInputElement).addEventListener("change", onSlotFile(i));
    document.querySelectorAll(`.slot-pick[data-i="${i}"]`).forEach((b) => {
      (b as HTMLButtonElement).addEventListener("click", (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        (el("file" + i) as HTMLInputElement).click();
      });
    });
    document.querySelectorAll(`.slot-cam[data-i="${i}"],.slot-retake[data-i="${i}"]`).forEach((b) => {
      (b as HTMLButtonElement).addEventListener("click", (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        takePhoto(i);
      });
    });
    document.querySelectorAll(`.slot-relib[data-i="${i}"]`).forEach((b) => {
      (b as HTMLButtonElement).addEventListener("click", (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        (el("file" + i) as HTMLInputElement).click();
      });
    });
    paintSlot(i);
  });
  // Edit mode: filled from a product card's Update button. Unchanged
  // slots keep their current photo (fetched back into the form), so a
  // text-only change re-saves identical bytes under the same id.
  let editingId = "";
  const setField = (sel: string, v: string): void => {
    const n = document.querySelector(`#bundle-form ${sel}`) as HTMLInputElement | null;
    if (n) n.value = v;
  };
  function exitEdit(): void {
    editingId = "";
    (el("bd-submit") as HTMLButtonElement).textContent = "Save bundle";
    for (let i = 0; i < 3; i++) {
      (el("file" + i) as HTMLInputElement).value = "";
      const img = el("slot-img-" + i) as HTMLImageElement;
      delete img.dataset.keepUrl; delete img.dataset.genUrl;
      paintSlot(i);
    }
  }
  (window as unknown as { __bdEdit?: (p: Product) => void }).__bdEdit = (p: Product) => {
    editingId = p.id;
    setField("[name=title]", p.title);
    setField("[name=description]", p.description || "");
    setField("[name=price_cents]", toMajor(p.price_cents));
    setField("[name=sizes]", (p.sizes || []).join(","));
    const cur = document.getElementById("bd-currency") as HTMLSelectElement | null;
    if (cur) {
      const code = (p.currency || DEFAULT_CURRENCY).toUpperCase();
      if (![...cur.options].some((o) => o.value === code)) cur.add(new Option(code, code));
      cur.value = code;
      const price = el("bd-price") as HTMLInputElement;
      price.placeholder = `Price (${currencyInfo(code).code}) *`;
    }
    const sel = document.getElementById("bd-cat") as HTMLSelectElement | null;
    if (sel) {
      if (p.category && ![...sel.options].some((o) => o.value === p.category)) {
        sel.add(new Option(p.category, p.category));
      }
      sel.value = p.category || "";
    }
    const urls = [p.image_url, p.model_image_url, p.styled_image_url];
    urls.forEach((u, i) => {
      const img = el("slot-img-" + i) as HTMLImageElement;
      if (u) { img.src = u; img.dataset.keepUrl = u; show(img, true); }
      else { img.removeAttribute("src"); delete img.dataset.keepUrl; show(img, false); }
      (el("file" + i) as HTMLInputElement).value = "";
      paintSlot(i);
    });
    (el("bd-submit") as HTMLButtonElement).textContent = "Save changes";
    el("bd-err").textContent = ""; show(el("bd-err"), false);
    document.getElementById("owner")?.scrollIntoView({ behavior: "smooth" });
  };
  el("bundle-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    void (async () => {
      const fd = new FormData(ev.target as HTMLFormElement);
      if (editingId) fd.set("id", editingId);
      if (!String(fd.get("title") || "").trim()) { fail("Title is required."); return; }
      // Owner types major units (12000 UGX / 19.99 USD); store minor.
      fd.set("price_cents", String(toMinor(String(fd.get("price_cents") ?? "0"))));
      // Slots without a new file keep their current photo: fetch it back
      // so the save carries identical bytes (no duplicates, nothing lost).
      for (let i = 0; i < 3; i++) {
        const cur = fd.get("image" + i);
        if (cur instanceof File && cur.size) continue;
        const keep = (el("slot-img-" + i) as HTMLImageElement).dataset.keepUrl || "";
        const gen = i === 2 ? (el("slot-img-2") as HTMLImageElement).dataset.genUrl || "" : "";
        const src = keep || gen;
        if (!src) continue;
        try {
          const b = await (await fetch(src)).blob();
          fd.set("image" + i, new File([b], "slot" + i + ".jpg", { type: b.type || "image/jpeg" }));
        } catch { fail("Kept photo expired - re-pick slot " + (i + 1) + "."); return; }
      }
      const img0 = fd.get("image0");
      if (!(img0 instanceof File) || !img0.size) { fail("Garment photo is required."); return; }
      const btn = el("bd-submit") as HTMLButtonElement;
      btn.disabled = true; btn.textContent = "Uploading…";
      try {
        const j = await createProduct(fd, loadOwner());
        btn.disabled = false; btn.textContent = editingId ? "Save changes" : "Save bundle";
        const ok = el("bd-ok");
        ok.innerHTML = `Saved: <a href="/app/product.html?id=${encodeURIComponent(j.id)}">${esc(j.id)}</a> - now on the landing grid.`;
        show(ok, true);
        exitEdit();
        window.dispatchEvent(new Event("cats-changed"));
      } catch (e) { btn.disabled = false; btn.textContent = editingId ? "Save changes" : "Save bundle"; fail(e instanceof Error ? e.message : String(e)); }
    })();
  });
  void refresh();
}
