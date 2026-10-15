/* components/timeline.js — newest-first strip. Click re-selects.
   Storage lives in core/store.js; this file only renders + routes clicks. */
import { esc } from "../core/format.js";
import { loadTimeline } from "../core/store.js";

export function paintTimeline(onSelect, activeThumb = null) {
  const tl = document.getElementById("st-timeline");
  const th = document.getElementById("st-tlhead");
  if (!tl || !th) return;
  const list = loadTimeline();
  tl.innerHTML = "";
  if (!list.length) { tl.style.display = "none"; th.style.display = "none"; return; }
  tl.style.display = ""; th.style.display = "";
  list.forEach((e) => {
    const b = document.createElement("button");
    b.className = "tl-item" + (e.thumb === activeThumb ? " on" : "");
    b.innerHTML = `<img src="${esc(e.thumb)}" alt="${esc(e.kind)}"/>`;
    b.onclick = () => onSelect(e);
    tl.appendChild(b);
  });
}
