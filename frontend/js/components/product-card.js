/* components/product-card.js — card markup + swap arming. No fetch here. */
import { esc, money } from "../core/format.js";
import { inquireUrl } from "../core/whatsapp.js";

export function cardHTML(p, shop, owner) {
  const model = p.model_image_url || p.image_url;
  return `<article class="productcard" data-garment="${esc(p.image_url)}" data-model="${esc(model)}" data-styled="${esc(p.styled_image_url || "")}">
    <a href="/app/product.html?id=${esc(p.id)}"><img class="img main" loading="lazy" src="${esc(p.image_url)}" alt="${esc(p.title)}"/></a>
    <div class="badge-pill"></div><p class="badge">${esc(p.category)}</p>
    <button class="model-inset" aria-label="view model"><img loading="lazy" src="${esc(model)}" alt="model without garment"/></button>
    <p class="swap-cur">Garment — tap model to swap</p>
    <p class="title">${esc(p.title)}</p><p class="price">${esc(money(p))}</p>
    <a class="btn-tryon" href="/app/product.html?id=${esc(p.id)}"><span class="btn-tryon-label">Try On</span></a>
    <a class="btn-inquire" target="_blank" rel="noopener" href="${esc(inquireUrl(owner, shop, p.title, p.id))}"><span class="btn-inquire-label">Inquire</span></a>
  </article>`;
}

/* Tap inset swaps garment<->model; hold on the person shows styled. */
export function armSwap(root) {
  const main = root.querySelector("img.main"), inset = root.querySelector(".model-inset");
  const mi = root.dataset.model, si = root.dataset.styled, gi = root.dataset.garment;
  const cur = root.querySelector(".swap-cur");
  let showing = "garment", timer = null;
  const set = (src, label) => { main.src = src; if (cur) cur.textContent = label; };
  if (inset) inset.addEventListener("click", (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    if (showing === "garment" && mi) { showing = "person"; set(mi, "Model — hold to see it worn"); }
    else { showing = "garment"; set(gi, "Garment — tap model to swap"); }
  });
  const hold = (ev) => {
    if (showing !== "person" || !si) return;
    ev.preventDefault();
    timer = setTimeout(() => { set(si, "Wearing it — release to go back"); timer = "held"; }, 350);
  };
  const release = () => { if (timer === "held") set(mi, "Model — hold to see it worn"); clearTimeout(timer); timer = null; };
  main.addEventListener("pointerdown", hold);
  main.addEventListener("pointerup", release);
  main.addEventListener("pointerleave", () => { clearTimeout(timer); timer = null; });
}

export function armAll(scope = document) {
  scope.querySelectorAll(".productcard").forEach(armSwap);
}
