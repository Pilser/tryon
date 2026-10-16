/* components/timeline.ts - newest-first strip. Click re-selects.
   Storage lives in core/store.ts; this file only renders + routes clicks. */
import * as stylex from "@stylexjs/stylex";
import { timeline as s } from "../styles/panels.stylex";
import { esc } from "../core/format";
import { loadTimeline } from "../core/store";
import type { TimelineEntry } from "../core/types";
import { skin } from "../skin";

const cx = (...ss: any[]): string =>
  (stylex.props(ss.filter(Boolean)) as { className?: string }).className ?? "";

export type SelectFn = (e: TimelineEntry) => void;

export function paintTimeline(onSelect: SelectFn, activeThumb: string | null = null): void {
  const tl = document.getElementById("st-timeline");
  const th = document.getElementById("st-tlhead");
  if (!tl || !th) return;
  const list = loadTimeline();
  tl.innerHTML = "";
  // Leading tiles: Take photo (camera) then Add photo (library).
  // The ribbon itself is the whole photo interface - no separate picker box.
  const take = document.createElement("label");
  take.className = cx(s.take);
  take.setAttribute("for", "pick-cam");
  take.title = "Take a photo now";
  take.innerHTML = `<span class="${cx(s.takeIcon)}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span><span class="${cx(s.addLabel)}">Take photo</span>`;
  tl.appendChild(take);
  const add = document.createElement("label");
  add.className = cx(s.add);
  add.setAttribute("for", "pick-file");
  add.title = "Add your photo";
  add.innerHTML = `<span class="${cx(s.addIcon)}">+</span><span class="${cx(s.addLabel)}">Add photo</span>`;
  tl.appendChild(add);
  if (!list.length) { tl.style.display = ""; th.style.display = "none"; skin(tl); return; }
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
