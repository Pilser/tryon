/* components/filters.js — category pills. Links drive server-style
   filtering via query string; no state kept here. */
import { esc } from "../core/format.js";

export function pillsHTML(categories, active) {
  const link = (cls, cat, label) =>
    `<a class="${cls}${cat === active ? " on" : ""}" href="/app/${cat ? "?category=" + encodeURIComponent(cat) : ""}">${esc(label)}</a>`;
  return link("pill-all", "", "All") + categories.map((c) => link("pill-1", c, c)).join("");
}
