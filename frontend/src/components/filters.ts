/* components/filters.ts — category pills. Links drive filtering via
   query string; no state kept here. */
import * as stylex from "@stylexjs/stylex";
import { landing as s } from "../styles/landing.stylex";
import { esc } from "../core/format";

const cx = (s: any): string => (stylex.props(s) as { className?: string }).className ?? "";

export function pillsHTML(categories: string[], active: string): string {
  const link = (cls: string, cat: string, label: string): string => {
    const base = cls === "pill-all" ? s.pillAll : s.pill;
    const on = cat === active ? " " + cx(s.pillOn) : "";
    return `<a class="${cx(base)}${on}" href="/app/${cat ? "?category=" + encodeURIComponent(cat) : ""}">${esc(label)}</a>`;
  };
  return link("pill-all", "", "All") + categories.map((c) => link("pill-1", c, c)).join("");
}
