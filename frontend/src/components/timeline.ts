/* components/timeline.ts — newest-first strip. Click re-selects.
   Storage lives in core/store.ts; this file only renders + routes clicks. */
import * as stylex from "@stylexjs/stylex";
import { timeline as s } from "../styles/panels.stylex";
import { esc } from "../core/format";
import { loadTimeline } from "../core/store";
import type { TimelineEntry } from "../core/types";
import { skin } from "../skin";

const cx = (s: any): string => (stylex.props(s) as { className?: string }).className ?? "";

export type SelectFn = (e: TimelineEntry) => void;

export function paintTimeline(onSelect: SelectFn, activeThumb: string | null = null): void {
  const tl = document.getElementById("st-timeline");
  const th = document.getElementById("st-tlhead");
  if (!tl || !th) return;
  const list = loadTimeline();
  tl.innerHTML = "";
  if (!list.length) { tl.style.display = "none"; th.style.display = "none"; return; }
  tl.style.display = ""; th.style.display = "";
  list.forEach((e) => {
    const b = document.createElement("button");
    b.className = cx(s.item) + (e.thumb === activeThumb ? " " + cx(s.itemOn) : "");
    b.innerHTML = `<img class="${cx(s.itemImg)}" src="${esc(e.thumb)}" alt="${esc(e.kind)}"/>`;
    b.onclick = () => onSelect(e);
    tl.appendChild(b);
  });
  skin(tl);
}
