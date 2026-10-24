/* pages/landing.ts - compose only: shop + category ribbon + search +
   cards. The hero is deliberately compact: search is behind an icon in
   the navbar (revealed on tap), the product count only shows for the
   logged-in owner, and the ribbon mirrors the studio one (scrollable
   icons, tap reveals a category mini-grid). */
import { getShop, listProducts, listCategories } from "../core/api";
import { all as allProducts, shopSync, productsSync } from "../core/shop-cache";
import { esc, brandHTML } from "../core/format";
import { cardHTML, armAll } from "../components/product-card";
import { ribbonCats, catRibbonHTML, armCatRibbon } from "../components/cat-ribbon";
import { loadOwner } from "../core/store";
import { skin } from "../skin";
import type { Product } from "../core/types";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const n = document.getElementById(id);
  if (!n) throw new Error("missing #" + id);
  return n as T;
}

function paintGrid(list: Product[], name: string, wa: string): void {
  // The "N products" line is owner-only (it eats hero space for guests).
  if (loadOwner()) {
    const c = el("count");
    c.textContent = list.length + " products";
    c.style.display = "";
  }
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

  // Search toggle: a navbar icon reveals the compact search row.
  const toggle = document.getElementById("search-toggle");
  const form = document.getElementById("search-form");
  if (toggle && form) {
    toggle.addEventListener("click", () => {
      const visible = form.style.display !== "none" && form.style.display !== "";
      if (visible) {
        form.style.display = "none";
        toggle.setAttribute("aria-expanded", "false");
      } else {
        form.style.display = "";
        toggle.setAttribute("aria-expanded", "true");
        el<HTMLInputElement>("q").focus();
      }
    });
  }

  el<HTMLInputElement>("q").value = query;

  // one parallel round trip replaces what the cache showed. Unfiltered
  // pages reuse the all-list as THE list (cache-aware all() keeps the
  // next page's instant paint alive); filtered pages ask the server
  // (exact semantics), in PARALLEL not chain.
  const allP = allProducts();
  const listP = query || category ? listProducts({ q: query, category }) : allP;
  const [shopNow, allList, list] = await Promise.all([getShop(), allP, listP]);
  if (brand) brand.innerHTML = brandHTML(shopNow);
  const cats = [...new Set(allList.map((p) => (p.category || "").trim()).filter(Boolean))].sort();
  const sel = el<HTMLSelectElement>("cat");
  sel.innerHTML = `<option value="">All</option>` + cats.map((c) =>
    `<option value="${esc(c)}"${c === category ? " selected" : ""}>${esc(c)}</option>`).join("");
  paintGrid(list, shopNow.shop_name, shopNow.owner_whatsapp);

  // Category ribbon: same component as the studio — scrollable icon row
  // (with chevrons on overflow), tap reveals that category's products.
  const zone = document.getElementById("st-cats");
  if (zone) {
    const rc = ribbonCats(await listCategories(), allList);
    if (rc.length) {
      zone.innerHTML = catRibbonHTML(rc);
      armCatRibbon(zone, rc, allList, false);
      skin();
    }
  }

  el("search-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    location.href = "/?q=" + encodeURIComponent(el<HTMLInputElement>("q").value)
      + "&category=" + encodeURIComponent(el<HTMLSelectElement>("cat").value);
  });
}
