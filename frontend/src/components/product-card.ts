/* components/product-card.ts — serious e-commerce card + shared gallery.
   3-image bundle: G=garment flat, S=model WEARING it, M=model WITHOUT.
   State machine (landing + detail share it):
   START: LARGE=G, SMALL=S · click SMALL -> LARGE=S, SMALL=G
   HOLD LARGE=S -> LARGE=M (compare without), SMALL stays G · release -> LARGE=S
   Click SMALL=G -> back to LARGE=G, SMALL=S. */
import * as stylex from "@stylexjs/stylex";
import { card as s, gallery as g } from "../styles/card.stylex";
import type { Product } from "../core/types";
import { esc, money } from "../core/format";
import { inquireUrl } from "../core/whatsapp";
import { waIcon } from "./whatsapp-icon";

const cx = (...ss: any[]): string =>
  (stylex.props(ss.filter(Boolean)) as { className?: string }).className ?? "";

export function bundleOf(p: Product): { g: string; m: string; s: string } {
  const g0 = p.image_url;
  const m = p.model_image_url || p.image_url;
  const s0 = p.styled_image_url || p.model_image_url || p.image_url;
  return { g: g0, m, s: s0 };
}

const CAP_G = "Garment — tap inset to see it worn";
const CAP_S = "Worn — hold to compare without · tap inset for garment";

export function cardHTML(p: Product, shop: string, owner: string): string {
  const b = bundleOf(p);
  const single = !(p.styled_image_url || p.model_image_url);
  return `<article class="${cx(s.root)} productcard" data-garment="${esc(b.g)}" data-model="${esc(b.m)}" data-styled="${esc(b.s)}">
    <a class="${cx(s.media)}" href="/app/product.html?id=${esc(p.id)}" tabindex="-1"><img class="${cx(s.img)} main" loading="lazy" decoding="async" draggable="false" src="${esc(b.g)}" alt="${esc(p.title)}"/></a>
    <div class="${cx(s.badgePill)}"></div><p class="${cx(s.badge)}">${esc(p.category)}</p>
    ${single ? "" : `<button class="${cx(s.inset)} model-inset" aria-label="see it worn"><img class="${cx(s.insetImg)} inset-img" loading="lazy" decoding="async" draggable="false" src="${esc(b.s)}" alt="model wearing it"/></button>
    <p class="${cx(s.caption)} swap-cur">${CAP_G}</p>`}
    <p class="${cx(s.title)}">${esc(p.title)}</p><p class="${cx(s.price)}">${esc(money(p))}</p>
    <a class="${cx(s.tryon)}" href="/app/studio.html?id=${esc(p.id)}"><span class="${cx(s.tryonLabel)}">Try On</span></a>
    <a class="${cx(s.inquire)}" target="_blank" rel="noopener" href="${esc(inquireUrl(owner, shop, p.title, p.id))}"><span class="${cx(s.inquireLabel)}">${waIcon()} Inquire</span></a>
  </article>`;
}

/* Detail gallery reuses the same state machine, larger frame. */
export function galleryHTML(p: Product): string {
  const b = bundleOf(p);
  const single = !(p.styled_image_url || p.model_image_url);
  return `<div class="${cx(g.root)} productcard" data-garment="${esc(b.g)}" data-model="${esc(b.m)}" data-styled="${esc(b.s)}">
    <div class="${cx(g.frame)}"><img class="${cx(g.main)} main" draggable="false" src="${esc(b.g)}" alt="${esc(p.title)}"/>
    ${single ? "" : `<button class="${cx(g.inset)} model-inset" aria-label="see it worn"><img class="${cx(g.insetImg)} inset-img" draggable="false" src="${esc(b.s)}" alt="model wearing it"/></button>`}</div>
    ${single ? "" : `<p class="${cx(g.cap)} swap-cur">${CAP_G}</p><p class="${cx(g.hint)}">Tap inset to swap · hold worn photo to compare without</p>`}
  </div>`;
}

/* Tap inset swaps LARGE<->SMALL (both imgs); hold on worn LARGE peeks M. */
export function armSwap(root: Element): void {
  const main = root.querySelector("img.main") as HTMLImageElement | null;
  const insetImg = root.querySelector("img.inset-img") as HTMLImageElement | null;
  const inset = root.querySelector(".model-inset") as HTMLButtonElement | null;
  if (!main) return;
  const el = root as HTMLElement;
  const gi = el.dataset.garment ?? "", mi = el.dataset.model ?? "", si = el.dataset.styled ?? "";
  if (!inset || !insetImg || (!si && !mi)) return;
  const cur = root.querySelector(".swap-cur");
  let showing: "garment" | "worn" = "garment", timer: number | null = null, held = false;
  const paint = (large: string, small: string, label: string, btn: string): void => {
    main.src = large; insetImg.src = small;
    main.alt = showing === "garment" ? "garment" : "model wearing it";
    if (cur) cur.textContent = label;
    inset.setAttribute("aria-label", btn);
  };
  const toWorn = (): void => { showing = "worn"; paint(si, gi, CAP_S, "back to garment"); };
  const toGarment = (): void => { showing = "garment"; paint(gi, si, CAP_G, "see it worn"); };
  for (const u of [gi, mi, si]) { if (u) { const im = new Image(); im.src = u; } }
  inset.addEventListener("click", (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    if (showing === "garment") toWorn(); else toGarment();
  });
  const hold = (ev: Event): void => {
    if (showing !== "worn" || !mi || mi === si) return;
    ev.preventDefault();
    timer = window.setTimeout(() => {
      held = true; main.src = mi; if (cur) cur.textContent = "Without it — release to compare";
      main.classList.add("holding");
    }, 350);
  };
  const release = (): void => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    if (held) {
      held = false; main.src = si; main.classList.remove("holding");
      if (cur) cur.textContent = CAP_S;
    }
  };
  main.addEventListener("pointerdown", hold);
  main.addEventListener("pointerup", release);
  main.addEventListener("pointercancel", release);
  main.addEventListener("pointerleave", release);
  main.addEventListener("contextmenu", (e) => { if (showing === "worn") e.preventDefault(); });
}

export function armAll(scope: ParentNode = document): void {
  scope.querySelectorAll(".productcard").forEach(armSwap);
}
