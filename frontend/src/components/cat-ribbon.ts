/* components/cat-ribbon.ts - horizontal category icon ribbon for the studio
   page. Collapsed it shows icons; tapping one expands a panel below with a
   search box and that category's products (feed-style mini grid). Tapping
   the same icon collapses. Products with no known category land in Others. */
import * as stylex from "@stylexjs/stylex";
import { cats as s } from "../styles/panels.stylex";
import { esc } from "../core/format";
import type { Category, Product } from "../core/types";

const cx = (...ss: any[]): string =>
  (stylex.props(ss.filter(Boolean)) as { className?: string }).className ?? "";

/** StyleX props are space-separated atomic classes; classList rejects any
    token containing whitespace, so split before touching the list. */
const setCls = (el: Element, c: string, on: boolean): void => {
  const toks = c.split(/\s+/).filter(Boolean);
  if (!toks.length) return;
  if (on) el.classList.add(...toks);
  else el.classList.remove(...toks);
};

export interface RibbonCat {
  key: string;
  title: string;
  img: string;
}

/* Managed categories first (with uploaded icons), then any product-only
   categories (first product image as icon), then Others when needed. */
export function ribbonCats(managed: Category[], products: Product[]): RibbonCat[] {
  const out: RibbonCat[] = [];
  const seen = new Set<string>();
  for (const c of managed) {
    const k = c.title.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ key: k, title: c.title.trim(), img: c.image_url });
  }
  for (const p of products) {
    const k = (p.category || "").trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ key: k, title: (p.category || "").trim(), img: p.image_url });
  }
  if (products.some((p) => {
    const k = (p.category || "").trim().toLowerCase();
    return !k || !seen.has(k);
  })) {
    const other = products.find((p) => {
      const k = (p.category || "").trim().toLowerCase();
      return !k || !seen.has(k);
    });
    out.push({ key: "", title: "Others", img: other ? other.image_url : "" });
  }
  return out;
}

export function othersOf(products: Product[], keys: Set<string>): Product[] {
  return products.filter((p) => {
    const k = (p.category || "").trim().toLowerCase();
    return !k || !keys.has(k);
  });
}

export function catRibbonHTML(cats: RibbonCat[]): string {
  return `<div class="${cx(s.row)}" id="st-cat-row">` + cats.map((c) =>
    `<button class="${cx(s.item)}" type="button" data-cat="${esc(c.key)}" title="${esc(c.title)}">`
    + (c.img ? `<img class="${cx(s.img)}" loading="lazy" decoding="async" src="${esc(c.img)}" alt=""/>` : `<span class="${cx(s.img)} ${cx(s.imgBlank)}">?</span>`)
    + `<span class="${cx(s.label)}">${esc(c.title)}</span></button>`).join("") + `</div>`
    + `<div class="${cx(s.panel)}" id="st-cat-panel" style="display:none">`
    + `<input class="${cx(s.q)}" id="st-cat-q" type="search" placeholder="Search in this category"/>`
    + `<h4 class="${cx(s.title)}" id="st-cat-title"></h4>`
    + `<div class="${cx(s.grid)}" id="st-cat-grid"></div></div>`;
}

export function armCatRibbon(box: HTMLElement, cats: RibbonCat[], products: Product[], owner: boolean): void {
  const row = box.querySelector("#st-cat-row");
  const panel = box.querySelector("#st-cat-panel") as HTMLElement | null;
  const q = box.querySelector("#st-cat-q") as HTMLInputElement | null;
  const grid = box.querySelector("#st-cat-grid");
  const title = box.querySelector("#st-cat-title");
  if (!row || !panel || !q || !grid || !title) return;
  let open = "";
  const known = new Set(cats.map((c) => c.key).filter(Boolean));
  const paintGrid = (): void => {
    const query = q.value.trim().toLowerCase();
    const list = (open === "" ? othersOf(products, known) : products.filter((p) => (p.category || "").trim().toLowerCase() === open))
      .filter((p) => !query || p.title.toLowerCase().includes(query));
    title.textContent = (cats.find((c) => c.key === open)?.title || "Others") + " (" + list.length + ")";
    grid.innerHTML = list.slice(0, 12).map((p) =>
      `<a class="${cx(s.mini)}" href="/app/studio.html?id=${esc(p.id)}${owner ? "&owner=1" : ""}">`
      + `<img class="${cx(s.miniImg)}" loading="lazy" decoding="async" src="${esc(p.image_url)}" alt="${esc(p.title)}"/>`
      + `<span class="${cx(s.miniTitle)}">${esc(p.title)}</span></a>`).join("")
      || `<p class="${cx(s.miniEmpty)}">No products here yet.</p>`;
  };
  row.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      const key = (b as HTMLElement).dataset.cat || "";
      open = open === key ? "" : key;
      if (!open) { panel.style.display = "none"; }
      else { panel.style.display = ""; q.value = ""; paintGrid(); }
      row.querySelectorAll("button").forEach((x) => {
        if ((x as HTMLElement).dataset.cat === open && open) setCls(x, cx(s.itemOn), true);
        else setCls(x, cx(s.itemOn), false);
      });
    });
  });
  q.addEventListener("input", paintGrid);
}
