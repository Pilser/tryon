/* components/filters.ts - category pills. Links drive filtering via
   query string; no state kept here. */
import * as stylex from "@stylexjs/stylex";
import { landing as s } from "../styles/landing.stylex";
import { esc } from "../core/format";

const cx = (...ss: any[]): string =>
  (stylex.props(ss.filter(Boolean)) as { className?: string }).className ?? "";

export function pillsHTML(categories: string[], active: string): string {
  const link = (isAll: boolean, cat: string, label: string): string => {
    const cls = cx(s.pill, cat === active && s.pillOn, isAll && s.pillAll);
    return `<a class="${cls}" href="/${cat ? "?category=" + encodeURIComponent(cat) : ""}">${esc(label)}</a>`;
  };
  return link(true, "", "All") + categories.map((c) => link(false, c, c)).join("");
}
