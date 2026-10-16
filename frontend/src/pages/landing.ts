/* pages/landing.ts - compose only: shop + filters + cards. */
import { getShop, listProducts } from "../core/api";
import { pillsHTML } from "../components/filters";
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
  const cats = [...new Set(all.map((p) => p.category).filter(Boolean))].sort();
  el("pills").innerHTML = pillsHTML(cats, category);
  const list = await listProducts({ q: query, category });
  el("count").textContent = list.length + " products";
  el("grid").innerHTML =
    list.map((p) => cardHTML(p, shop.shop_name, shop.owner_whatsapp)).join("");
  armAll();
  skin();
  el("search-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    location.href = "/?q=" + encodeURIComponent(el<HTMLInputElement>("q").value);
  });
}
