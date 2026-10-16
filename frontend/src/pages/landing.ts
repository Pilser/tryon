/* pages/landing.ts - compose only: shop + inline search/filter + cards. */
import { getShop, listProducts } from "../core/api";
import { esc } from "../core/format";
import { cardHTML, armAll } from "../components/product-card";
import { skin } from "../skin";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const n = document.getElementById(id);
  if (!n) throw new Error("missing #" + id);
  return n as T;
}

export async function landing(): Promise<void> {
  const shop = await getShop();
  const q = new URLSearchParams(location.search);
  const query = q.get("q") || "", category = q.get("category") || "";
  const brand = document.querySelector(".brand");
  if (brand) brand.textContent = shop.shop_name;
  el<HTMLInputElement>("q").value = query;
  const all = await listProducts();
  const cats = [...new Set(all.map((p) => (p.category || "").trim()).filter(Boolean))].sort();
  const sel = el<HTMLSelectElement>("cat");
  sel.innerHTML = `<option value="">All</option>` + cats.map((c) =>
    `<option value="${esc(c)}"${c === category ? " selected" : ""}>${esc(c)}</option>`).join("");
  const list = await listProducts({ q: query, category });
  el("count").textContent = list.length + " products";
  el("grid").innerHTML =
    list.map((p) => cardHTML(p, shop.shop_name, shop.owner_whatsapp)).join("");
  armAll();
  skin();
  el("search-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    location.href = "/?q=" + encodeURIComponent(el<HTMLInputElement>("q").value)
      + "&category=" + encodeURIComponent(el<HTMLSelectElement>("cat").value);
  });
}
