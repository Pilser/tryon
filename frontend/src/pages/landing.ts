/* pages/landing.ts - compose only: shop + inline search/filter + cards.
   Paints the grid from the previous page's cache instantly, then one
   parallel round trip replaces it with live data (the old code chained
   THREE round trips before anything appeared). */
import { getShop, listProducts } from "../core/api";
import { all as allProducts, shopSync, productsSync } from "../core/shop-cache";
import { esc, brandHTML } from "../core/format";
import { cardHTML, armAll } from "../components/product-card";
import { skin } from "../skin";
import type { Product } from "../core/types";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const n = document.getElementById(id);
  if (!n) throw new Error("missing #" + id);
  return n as T;
}

function paintGrid(list: Product[], name: string, wa: string): void {
  el("count").textContent = list.length + " products";
  el("grid").innerHTML = list.map((p, i) => cardHTML(p, name, wa, i)).join("");
  armAll();
  skin();
}

export async function landing(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const query = q.get("q") || "", category = q.get("category") || "";

  // instant paint from the cache a previous page left behind
  const cachedShop = shopSync();
  const brand = document.querySelector(".brand");
  if (brand && cachedShop) brand.innerHTML = brandHTML(cachedShop);
  const cached = productsSync();
  if (cached && !query && !category) {
    paintGrid(cached, cachedShop?.shop_name || "Shop", cachedShop?.owner_whatsapp || "");
  }
  // no cache: the skeleton baked into the shell HTML stands in the grid
  // until this fetch answers (YouTube's loading state, zero JS needed).

  el<HTMLInputElement>("q").value = query;

  // one parallel round trip replaces what the cache showed. Unfiltered
  // pages reuse the all-list as THE list (single note: the cache-aware
  // all() keeps the next page's instant paint alive); filtered pages
  // still ask the server (exact semantics), now in PARALLEL not chain.
  const allP = allProducts(); // cache-aware; fresh hits paint from cache alone
  const listP = query || category ? listProducts({ q: query, category }) : allP;
  const [shopNow, allList, list] = await Promise.all([getShop(), allP, listP]);
  if (brand) brand.innerHTML = brandHTML(shopNow);
  const cats = [...new Set(allList.map((p) => (p.category || "").trim()).filter(Boolean))].sort();
  const sel = el<HTMLSelectElement>("cat");
  sel.innerHTML = `<option value="">All</option>` + cats.map((c) =>
    `<option value="${esc(c)}"${c === category ? " selected" : ""}>${esc(c)}</option>`).join("");
  paintGrid(list, shopNow.shop_name, shopNow.owner_whatsapp);

  el("search-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    location.href = "/?q=" + encodeURIComponent(el<HTMLInputElement>("q").value)
      + "&category=" + encodeURIComponent(el<HTMLSelectElement>("cat").value);
  });
}
