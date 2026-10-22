/* components/skeleton.ts - YouTube-style loading placeholders.
   While a page waits for its data it shows grey shimmer blocks in the
   EXACT shape of what will replace them (media frame + title bar +
   price bar + buttons), so the layout never jumps and the first paint
   never looks like an empty/corrupted page. Blocks animate with the
   sk.box sweep (see ui.stylex); entrance reuses the card stagger. */

import * as stylex from "@stylexjs/stylex";
import { card as s, gallery as g } from "../styles/card.stylex";
import { sk, enterDelays, wait as uiWait } from "../styles/ui.stylex";

const cx = (...ss: unknown[]): string =>
  (stylex.props(ss.filter(Boolean) as never) as { className?: string }).className ?? "";

/** The stagger class for the skeleton at position `i` (same slots the
    real cards use, so replacement feels seamless). */
function enterCls(i: number): string {
  if (i <= 0) return "";
  const slot = ("d" + Math.min(i, 8)) as keyof typeof enterDelays;
  return " " + cx(uiWait.cardEnter, enterDelays[slot]);
}

/** One grid card skeleton, mirroring the product card's silhouette. */
export function skCardHTML(i = 0): string {
  return `<article class="${cx(s.root)}${enterCls(i)}">
    <div class="${cx(s.media)}"><div class="${cx(sk.box, sk.media)}"></div></div>
    <p class="${cx(s.caption)}"><span class="${cx(sk.box, sk.barWide)}"></span></p>
    <div class="${cx(s.head)}"><span class="${cx(sk.box, sk.bar)}"></span></div>
    <p class="${cx(s.price)}"><span class="${cx(sk.box, sk.barShort)}"></span></p>
    <span class="${cx(s.tryon, sk.box)}"></span>
    <span class="${cx(s.inquire, sk.box)}"></span>
  </article>`;
}

/** The landing grid placeholder: `n` staggered card skeletons. */
export function skGridHTML(n = 8): string {
  return Array.from({ length: n }, (_, i) => skCardHTML(i)).join("");
}

/** The detail-page placeholder: big frame left, title + text + price +
    action bars right - the same two-column silhouette render() paints. */
export function skDetailHTML(): string {
  return `<article class="detail">
    <div class="${cx(g.frame, sk.box)}"></div>
    <div><div class="${cx(sk.stack)}">
      <span class="${cx(sk.box, sk.bar)}"></span>
      <span class="${cx(sk.box, sk.barWide)}"></span>
      <span class="${cx(sk.box, sk.barWide)}"></span>
      <span class="${cx(sk.box, sk.barShort)}"></span>
      <span class="${cx(sk.box, sk.btn)}"></span>
    </div></div>
  </article>`;
}

/** The studio placeholder: frame + the two CTA bars the duo paints. */
export function skStudioHTML(): string {
  return `<div class="${cx(g.frame, sk.box)}"></div>
    <div class="${cx(sk.stack)}">
      <span class="${cx(sk.box, sk.bar)}"></span>
      <span class="${cx(sk.box, sk.btn)}"></span>
    </div>`;
}
