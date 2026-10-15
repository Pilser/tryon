/* pages/studio.ts — compose only: product context + studio + owner bundle.
   Visitor: pick/take photo (instant timeline) + try-on + results on top.
   Owner (?owner=1 or saved token): bundle upload below; styled slot can
   be uploaded OR filled from the latest try-on result. */
import { getProduct, getShop, listProducts } from "../core/api";
import { esc, money } from "../core/format";
import { galleryHTML, armAll } from "../components/product-card";
import { initStudio } from "../components/studio";
import { initAdminForm } from "../components/admin-form";
import { loadOwner, shortDevice } from "../core/store";
import { skin } from "../skin";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const n = document.getElementById(id);
  if (!n) throw new Error("missing #" + id);
  return n as T;
}

export async function studio(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const id = q.get("id") || "";
  const owner = q.get("owner") === "1" || !!loadOwner();
  const shop = await getShop();
  const brand = document.querySelector(".brand");
  if (brand) brand.textContent = shop.shop_name;

  const box = el("st-product");
  const list = await listProducts();
  const target = id || list[0]?.id || "";
  if (!target) {
    box.innerHTML = `<p class="error">No products yet — the owner adds them from this page.</p>`;
  } else {
    const p = id ? await getProduct(target) : list[0];
    document.title = "Try on " + p.title + " — " + shop.shop_name;
    box.innerHTML = `<div class="st-pick-row"><a class="back" href="/app/">← all products</a>
      <label class="hint" for="st-prod">Garment:</label>
      <select id="st-prod" class="st-select">${list.map((x) => `<option value="${esc(x.id)}"${x.id === p.id ? " selected" : ""}>${esc(x.title)} — ${esc(money(x))}</option>`).join("")}</select></div>`
      + galleryHTML(p);
    armAll(box);
    el<HTMLSelectElement>("st-prod").addEventListener("change", (ev) => {
      location.href = "/app/studio.html?id=" + encodeURIComponent((ev.target as HTMLSelectElement).value) + (owner ? "&owner=1" : "");
    });
    initStudio(p);
  }

  const own = document.getElementById("owner");
  const gate = document.getElementById("owner-gate");
  if (own) {
    if (owner) {
      own.style.display = ""; initAdminForm();
      if (gate) gate.style.display = "none";
    } else own.style.display = "none";
  }
  const dev = document.getElementById("st-device");
  if (dev) dev.textContent = "Photos stay in this browser (device " + shortDevice() + ") — same timeline on your next visit.";
  skin();
}
