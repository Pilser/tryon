import * as stylex from "@stylexjs/stylex";
import { tokens as t } from "./tokens.stylex";

/* Landing: same kit language as the dashboard - one page column, cards by
   hairline border, a responsive product grid. The hero is normal flow, so
   nothing overlaps on odd screen heights. */
export const landing = stylex.create({
  page: {
    /* The glow is a wide absolute blob: clip it so it can never widen the
       page (that would add horizontal scroll on phones). */
    position: "relative", overflow: "hidden",
    display: "grid", justifyItems: "center", textAlign: "center",
    gap: 8, width: "100%", maxWidth: 1100, marginLeft: "auto", marginRight: "auto",
    paddingTop: 10, paddingBottom: 6, paddingLeft: 14, paddingRight: 14,
    "@media (min-width: 720px)": { gap: 10, paddingTop: 16, paddingBottom: 8 },
  },
  glow: {
    position: "absolute", left: "50%", top: -180, width: 640, height: 420,
    transform: "translateX(-50%)",
    background: "radial-gradient(closest-side, rgba(185,217,60,.16), transparent)",
    pointerEvents: "none",
  },
  heroTitle: {
    margin: 0, color: t.text, fontFamily: t.fontHead, fontWeight: 700,
    fontSize: 24, lineHeight: 1.1,
    "@media (min-width: 720px)": { fontSize: 32 },
  },
  heroSub: {
    margin: 0, color: t.muted, fontSize: 13, lineHeight: 1.4, maxWidth: 560,
    "@media (min-width: 720px)": { fontSize: 14 },
  },
  search: {
    width: "100%", maxWidth: 620, height: 42, borderRadius: 10,
    backgroundColor: t.surface, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    display: "flex", alignItems: "center", gap: 4, boxSizing: "border-box",
    paddingLeft: 10, paddingRight: 4, paddingTop: 3, paddingBottom: 3,
    marginTop: 2,
  },
  searchIcon: { display: "flex", color: t.muted, flexShrink: 0 },
  searchInput: {
    flexGrow: 1, minWidth: 0,
    backgroundColor: "transparent", borderStyle: "none", outlineStyle: "none",
    color: t.text, fontSize: 14, height: 32,
  },
  catSel: {
    flexShrink: 0, maxWidth: 112, height: 34, borderRadius: 8,
    backgroundColor: t.bg, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    color: t.text, fontSize: 13, paddingLeft: 8, paddingRight: 4, outlineStyle: "none",
  },
  searchGo: {
    flexShrink: 0, width: 34, height: 34, borderRadius: 8,
    backgroundColor: t.primary, color: t.primaryInk,
    borderStyle: "none", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  count: { margin: 0, color: t.muted, fontSize: 12 },
  grid: {
    display: "grid", gap: 12,
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    width: "100%", maxWidth: 1100, marginLeft: "auto", marginRight: "auto",
    paddingLeft: 14, paddingRight: 14, paddingBottom: 40, paddingTop: 8,
    "@media (min-width: 720px)": {
      gap: 16, paddingLeft: 26, paddingRight: 26, paddingTop: 10,
      gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    },
  },
});
