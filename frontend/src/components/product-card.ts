/* components/product-card.ts — card markup (figcraft geometry) + swap. */
import * as stylex from "@stylexjs/stylex";
import { card as s } from "../styles/card.stylex";
import type { Product } from "../core/types";
import { esc, money } from "../core/format";
import { inquireUrl } from "../core/whatsapp";

const cx = (...ss: any[]): string =>
  (stylex.props(ss.filter(Boolean)) as { className?: string }).className ?? "";

export function cardHTML(p: Product, shop: string, owner: string): string {
  const model = p.model_image_url || p.image_url;
  return `<article class="${cx(s.root)} productcard" data-garment="${esc(p.image_url)}" data-model="${esc(model)}" data-styled="${esc(p.styled_image_url || "")}">
    <a href="/app/product.html?id=${esc(p.id)}"><img class="${cx(s.img)} main" loading="lazy" src="${esc(p.image_url)}" alt="${esc(p.title)}"/></a>
    <div class="${cx(s.badgePill)}"></div><p class="${cx(s.badge)}">${esc(p.category)}</p>
    <button class="${cx(s.inset)} model-inset" aria-label="view model"><img class="${cx(s.insetImg)}" loading="lazy" src="${esc(model)}" alt="model without garment"/></button>
    <p class="${cx(s.caption)} swap-cur">Garment — tap model to swap</p>
    <p class="${cx(s.title)}">${esc(p.title)}</p><p class="${cx(s.price)}">${esc(money(p))}</p>
    <a class="${cx(s.tryon)}" href="/app/product.html?id=${esc(p.id)}"><span class="${cx(s.tryonLabel)}">Try On</span></a>
    <a class="${cx(s.inquire)}" target="_blank" rel="noopener" href="${esc(inquireUrl(owner, shop, p.title, p.id))}"><span class="${cx(s.inquireLabel)}">Inquire</span></a>
  </article>`;
}

/* Tap inset swaps garment<->model; hold on the person shows styled. */
export function armSwap(root: Element): void {
  const main = root.querySelector("img.main") as HTMLImageElement | null;
  const inset = root.querySelector(".model-inset");
  if (!main) return;
  const el = root as HTMLElement;
  const mi = el.dataset.model ?? "", si = el.dataset.styled ?? "", gi = el.dataset.garment ?? "";
  const cur = root.querySelector(".swap-cur");
  let showing = "garment", timer: number | string | null = null;
  const set = (src: string, label: string): void => { main.src = src; if (cur) cur.textContent = label; };
  if (inset) inset.addEventListener("click", (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    if (showing === "garment" && mi) { showing = "person"; set(mi, "Model — hold to see it worn"); }
    else { showing = "garment"; set(gi, "Garment — tap model to swap"); }
  });
  const hold = (ev: Event): void => {
    if (showing !== "person" || !si) return;
    ev.preventDefault();
    timer = window.setTimeout(() => { set(si, "Wearing it — release to go back"); timer = "held"; }, 350);
  };
  const release = (): void => {
    if (timer === "held") set(mi, "Model — hold to see it worn");
    if (timer !== null && timer !== "held") clearTimeout(timer as number);
    timer = null;
  };
  main.addEventListener("pointerdown", hold);
  main.addEventListener("pointerup", release);
  main.addEventListener("pointerleave", () => { if (timer !== null && timer !== "held") clearTimeout(timer as number); timer = null; });
}

export function armAll(scope: ParentNode = document): void {
  scope.querySelectorAll(".productcard").forEach(armSwap);
}
