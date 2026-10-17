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
    gap: 14, width: "100%", maxWidth: 1100, marginLeft: "auto", marginRight: "auto",
    paddingTop: 96, paddingBottom: 8, paddingLeft: 14, paddingRight: 14,
    "@media (min-width: 720px)": { gap: 16, paddingTop: 116, paddingBottom: 14 },
  },
  glow: {
    position: "absolute", left: "50%", top: -180, width: 640, height: 420,
    transform: "translateX(-50%)",
    background: "radial-gradient(closest-side, rgba(185,217,60,.16), transparent)",
    pointerEvents: "none",
  },
  heroTitle: {
    margin: 0, color: t.text, fontFamily: t.fontHead, fontWeight: 700,
    fontSize: 34, lineHeight: 1.08,
    "@media (min-width: 720px)": { fontSize: 48 },
  },
  heroSub: {
    margin: 0, color: t.muted, fontSize: 15, lineHeight: 1.55, maxWidth: 560,
    "@media (min-width: 720px)": { fontSize: 17 },
  },
  search: {
    width: "100%", maxWidth: 620, height: 52, borderRadius: 12,
    backgroundColor: t.surface, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    display: "flex", alignItems: "center", gap: 4, boxSizing: "border-box",
    paddingLeft: 12, paddingRight: 4, paddingTop: 4, paddingBottom: 4,
    marginTop: 4,
  },
  searchIcon: { display: "flex", color: t.muted, flexShrink: 0 },
  searchInput: {
    flexGrow: 1, minWidth: 0,
    backgroundColor: "transparent", borderStyle: "none", outlineStyle: "none",
    color: t.text, fontSize: 16, height: 40,
  },
  catSel: {
    flexShrink: 0, maxWidth: 118, height: 44, borderRadius: 8,
    backgroundColor: t.bg, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    color: t.text, fontSize: 14, paddingLeft: 8, paddingRight: 4, outlineStyle: "none",
  },
  searchGo: {
    flexShrink: 0, width: 44, height: 44, borderRadius: 8,
    backgroundColor: t.primary, color: t.primaryInk,
    borderStyle: "none", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  count: { margin: 0, color: t.muted, fontSize: 13 },
  grid: {
    display: "grid", gap: 14,
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    width: "100%", maxWidth: 1100, marginLeft: "auto", marginRight: "auto",
    paddingLeft: 14, paddingRight: 14, paddingBottom: 40, paddingTop: 14,
    "@media (min-width: 720px)": {
      gap: 18, paddingLeft: 26, paddingRight: 26, paddingTop: 18,
      gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    },
  },
});
