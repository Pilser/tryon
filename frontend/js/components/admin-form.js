/* components/admin-form.js — 3-slot bundle upload. Slot tap picks that
   slot's photo; previews + validation inline; submit posts multipart. */
import { createProduct, listProducts } from "../core/api.js";
import { esc, money } from "../core/format.js";

const $ = (id) => document.getElementById(id);
const show = (el, on) => { el.style.display = on ? "" : "none"; };

export function initAdminForm() {
  const fail = (m) => { $("bd-err").textContent = m; show($("bd-err"), true); };
  [0, 1, 2].forEach((i) => {
    $("file" + i).addEventListener("change", (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      if (f.size > 10 * 1024 * 1024) { fail(`Photo ${i + 1} over 10 MB.`); ev.target.value = ""; return; }
      const img = $("slot-img-" + i);
      img.src = URL.createObjectURL(f); show(img, true);
    });
  });
  $("btn-photo").addEventListener("click", () => $("file0").click());
  $("btn-cam").addEventListener("click", () => $("filecam").click());
  $("filecam").addEventListener("change", (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const dt = new DataTransfer(); dt.items.add(f);
    $("file0").files = dt.files;
    $("file0").dispatchEvent(new Event("change"));
  });
  $("bundle-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    if (!String(fd.get("title") || "").trim()) return fail("Title is required.");
    const img0 = fd.get("image0");
    if (!(img0 instanceof File) || !img0.size) return fail("Garment photo is required.");
    const btn = $("bd-submit");
    btn.disabled = true; btn.textContent = "Uploading…";
    try {
      const j = await createProduct(fd);
      btn.disabled = false; btn.textContent = "Save bundle";
      const ok = $("bd-ok");
      ok.innerHTML = `Saved: <a href="/app/product.html?id=${encodeURIComponent(j.id)}">${esc(j.id)}</a> — now on the landing grid.`;
      show(ok, true);
      loadList();
    } catch (e) { btn.disabled = false; btn.textContent = "Save bundle"; fail(e.message); }
  });
  async function loadList() {
    try {
      const list = await listProducts();
      $("admin-list").innerHTML = list.slice(0, 8).map((p) =>
        `<p><a href="/app/product.html?id=${esc(p.id)}">${esc(p.title)}</a> — ${esc(money(p))}</p>`).join("");
    } catch {}
  }
  loadList();
}
