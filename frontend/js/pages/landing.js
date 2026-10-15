/* pages/landing.js — compose only: shop + filters + cards. */
import { getShop, listProducts } from "../core/api.js";
import { pillsHTML } from "../components/filters.js";
import { cardHTML, armAll } from "../components/product-card.js";

export async function landing() {
  const shop = await getShop();
  const q = new URLSearchParams(location.search);
  const query = q.get("q") || "", category = q.get("category") || "";
  document.querySelector(".brand").textContent = shop.shop_name;
  document.getElementById("q").value = query;
  const all = await listProducts();
  const cats = [...new Set(all.map((p) => p.category).filter(Boolean))].sort();
  document.getElementById("pills").innerHTML = pillsHTML(cats, category);
  const list = await listProducts({ q: query, category });
  document.getElementById("count").textContent = list.length + " products";
  document.getElementById("grid").innerHTML =
    list.map((p) => cardHTML(p, shop.shop_name, shop.owner_whatsapp)).join("");
  armAll();
  document.getElementById("search-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    location.href = "/app/?q=" + encodeURIComponent(document.getElementById("q").value);
  });
}
