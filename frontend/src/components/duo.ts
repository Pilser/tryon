/* components/duo.ts - product + user-photo duo shared by studio and product
   pages. Render with duoHTML, wire with armDuo. Fullscreen buttons show
   ONLY the photo frame (same nodes, so swap + hold keep working). */
import { galleryHTML, armAll, toggleFs } from "./product-card";
import type { Product } from "../core/types";

const FS_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`;

export function duoHTML(p: Product): string {
  return `<div class="duo-track" id="st-duo">`
    + `<div class="duo-cell"><div class="duo-fit">${galleryHTML(p)}</div></div>`
    + `<div class="duo-cell"><div class="usercard">`
    + `<button class="fs-btn" type="button" aria-label="Fullscreen">${FS_SVG}</button>`
    + `<img id="st-prev" class="usercard-img" draggable="false" style="display:none" alt="your photo"/>`
    + `<p class="usercard-empty" id="st-userempty">Your photo shows here. Take or add one from the ribbon below.</p>`
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
  });
  const next = scope.querySelector("#st-duo-next") as HTMLButtonElement | null;
  const duo = scope.querySelector("#st-duo") as HTMLElement | null;
  next?.addEventListener("click", () => {
    if (!duo) return;
    const atEnd = duo.scrollLeft > duo.scrollWidth - duo.clientWidth - 20;
    duo.scrollTo({ left: atEnd ? 0 : duo.scrollWidth, behavior: "smooth" });
  });
}
