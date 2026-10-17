/* components/duo.ts - product + user-photo duo shared by studio and product
   pages. Render with duoHTML, wire with armDuo. Fullscreen buttons show
   ONLY the photo frame (same nodes, so swap + hold keep working). */
import { galleryHTML, armAll, toggleFs, armFsFit } from "./product-card";
import type { Product } from "../core/types";
import { esc, sizesHTML } from "../core/format";

const FS_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`;

export function duoHTML(p: Product): string {
  return `<div class="duo-track" id="st-duo">`
    + `<div class="duo-cell"><div class="duo-ghead"><p class="duo-gtitle">${esc(p.title)}</p>${sizesHTML(p.sizes)}</div><div class="duo-fit">${galleryHTML(p)}</div></div>`
    + `<div class="duo-cell"><p class="usercard-title">Your photo</p><div class="usercard">`
    + `<img id="st-prev" class="usercard-img" draggable="false" style="display:none" alt="your photo"/>`
    + `<p class="usercard-empty" id="st-userempty">Your photo shows here. Take or add one from the ribbon below.</p>`
    + `<div class="userstrip" id="st-usertl" style="display:none"></div>`
    + `<button class="fs-btn" type="button" aria-label="Fullscreen">${FS_SVG}</button>`
    + `</div></div>`
    + `<button class="duo-arrow" id="st-duo-next" type="button" aria-label="See your photo">&#8250;</button></div>`;
}

export function armDuo(scope: ParentNode = document): void {
  armAll(scope);
  scope.querySelectorAll(".usercard").forEach((card) => {
    const b = card.querySelector(".fs-btn") as HTMLButtonElement | null;
    b?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      void toggleFs(card as HTMLElement);
    });
    const img = card.querySelector(".usercard-img") as HTMLImageElement | null;
    if (img) armFsFit(card, img);
  });
  const next = scope.querySelector("#st-duo-next") as HTMLButtonElement | null;
  const duo = scope.querySelector("#st-duo") as HTMLElement | null;
  const paintArrow = (): void => {
    if (!duo || !next) return;
    const max = duo.scrollWidth - duo.clientWidth;
    const atEnd = max > 20 && duo.scrollLeft > max - 20;
    next.textContent = atEnd ? "‹" : "›";
    next.setAttribute("aria-label", atEnd ? "Back to product" : "See your photo");
  };
  next?.addEventListener("click", () => {
    if (!duo) return;
    const max = duo.scrollWidth - duo.clientWidth;
    const atEnd = max > 20 && duo.scrollLeft > max - 20;
    duo.scrollTo({ left: atEnd ? 0 : duo.scrollWidth, behavior: "smooth" });
  });
  duo?.addEventListener("scroll", paintArrow, { passive: true });
  window.addEventListener("load", paintArrow, { once: true });
  paintArrow();
}
