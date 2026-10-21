/* kit.ts - the platform's window into the tryon design language.
   Re-exported straight from the shared kit, never copied: olive theme,
   hairline cards, square buttons (10px radius, never round), destructive
   actions red, buttons that never touch and go full-width on phones.
   Platform-only slots (fields, code rows, chips, tabs) live in
   styles/platform.stylex.ts - the tryon literal-class skin maps stay
   put. */
import * as stylex from "@stylexjs/stylex";
import { base } from "../../../../frontend/src/styles/base.stylex";

export { base };
export { tokens as kitTokens } from "../../../../frontend/src/styles/tokens.stylex";

export { ui } from "../../../../frontend/src/styles/ui.stylex";
export { pf } from "./styles/platform.stylex";
/* The public landing page's own slots (nav, hero, catalogue, tiers). */
export { ld } from "./styles/landing.stylex";
/* The admin-only slots (the compact table-row controls). They live in
   their own file so the owner console never fights over them. */
export { pa } from "./styles/platform-admin.stylex";

/* StyleX classes for React: flattened to the extracted className. Pass
   self-contained classes - runtime-merged pairs do not override each
   other, so conflicting properties must live in one class. */
type StylexLike = null | undefined | unknown;
type CxProps = (...xs: StylexLike[]) => CxPropsOut;
type CxPropsOut = Readonly<{ className?: string; style?: Readonly<Record<string, string | number>> }>;

export function cx(...styles: unknown[]): string {
  const p = (stylex.props as unknown as CxProps)(...styles);
  return p.className ?? "";
}

/* Boot: the tryon skins carry ["body",[base.body]] + ["*",[base.reset]];
   the platform's React pages have no skin pass, so the body gets its
   olive surface here and the box-sizing reset is injected once - same
   rule, one line, before any layout happens. */
export function boot(): void {
  document.body.className = cx(base.body);
  if (!document.getElementById("pf-reset")) {
    const el = document.createElement("style");
    el.id = "pf-reset";
    el.textContent = "*, *::before, *::after { box-sizing: border-box; }";
    document.head.appendChild(el);
  }
}
