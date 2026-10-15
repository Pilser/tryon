/* components/admin-form.ts — 3-slot bundle upload. Slot tap picks that
   slot's photo; previews + validation inline; submit posts multipart. */
import { createProduct, listProducts } from "../core/api";
import { esc, money } from "../core/format";
import type { Product } from "../core/types";
import { skin } from "../skin";

function el(id: string): HTMLElement {
  const n = document.getElementById(id);
  if (!n) throw new Error("missing #" + id);
  return n;
}
const show = (e: HTMLElement, on: boolean): void => { e.style.display = on ? "" : "none"; };

export function initAdminForm(): void {
  const fail = (m: string): void => { el("bd-err").textContent = m; show(el("bd-err"), true); };
  [0, 1, 2].forEach((i) => {
    (el("file" + i) as HTMLInputElement).addEventListener("change", (ev) => {
      const f = (ev.target as HTMLInputElement).files?.[0];
      if (!f) return;
      if (f.size > 10 * 1024 * 1024) { fail(`Photo ${i + 1} over 10 MB.`); (ev.target as HTMLInputElement).value = ""; return; }
      const img = el("slot-img-" + i) as HTMLImageElement;
      img.src = URL.createObjectURL(f); show(img, true);
    });
  });
  el("btn-photo").addEventListener("click", () => el("file0").click());
  el("btn-cam").addEventListener("click", () => el("filecam").click());
  el("filecam").addEventListener("change", (ev) => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const dt = new DataTransfer(); dt.items.add(f);
    (el("file0") as HTMLInputElement).files = dt.files;
    el("file0").dispatchEvent(new Event("change"));
  });
  el("bundle-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    void (async () => {
      const fd = new FormData(ev.target as HTMLFormElement);
      if (!String(fd.get("title") || "").trim()) { fail("Title is required."); return; }
      const img0 = fd.get("image0");
      if (!(img0 instanceof File) || !img0.size) { fail("Garment photo is required."); return; }
      const btn = el("bd-submit") as HTMLButtonElement;
      btn.disabled = true; btn.textContent = "Uploading…";
      try {
        const j = await createProduct(fd);
        btn.disabled = false; btn.textContent = "Save bundle";
        const ok = el("bd-ok");
        ok.innerHTML = `Saved: <a href="/app/product.html?id=${encodeURIComponent(j.id)}">${esc(j.id)}</a> — now on the landing grid.`;
        show(ok, true);
        await loadList();
      } catch (e) { btn.disabled = false; btn.textContent = "Save bundle"; fail(e instanceof Error ? e.message : String(e)); }
    })();
  });
  async function loadList(): Promise<void> {
    try {
      const list: Product[] = await listProducts();
      skin();
      el("admin-list").innerHTML = list.slice(0, 8).map((p) =>
        `<p><a href="/app/product.html?id=${esc(p.id)}">${esc(p.title)}</a> — ${esc(money(p))}</p>`).join("");
    } catch { /* grid still works without list */ }
  }
  void loadList();
}
