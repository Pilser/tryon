import * as stylex from "@stylexjs/stylex";
import { tokens as t } from "./tokens.stylex";

export const studio = stylex.create({
  /* The studio is a kit card now: hairline border + whitespace, not a
     transparent box floating on the page. */
  root: {
    minWidth: 0,
    backgroundColor: t.surface, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    borderRadius: 14, display: "grid", gap: 12,
    paddingTop: 14, paddingBottom: 14, paddingLeft: 14, paddingRight: 14,
    "@media (min-width: 720px)": {
      gap: 14, paddingTop: 18, paddingBottom: 18, paddingLeft: 20, paddingRight: 20,
    },
  },
  preview: { maxWidth: 280, borderRadius: 8 },
  resultImg: { maxWidth: "100%", borderRadius: 12 },
  /* One page wrapper for every shell (studio, product): kit metrics. */
  page: {
    display: "grid", gap: 14, width: "100%", maxWidth: 1100,
    marginLeft: "auto", marginRight: "auto",
    /* Grid children must be allowed to shrink: the studio's product/user
       duo is a horizontal scroller inside this grid. */
    gridTemplateColumns: "minmax(0, 1fr)",
    paddingTop: 66, paddingBottom: 40, paddingLeft: 14, paddingRight: 14,
    "@media (min-width: 720px)": {
      gap: 18, paddingTop: 78, paddingLeft: 26, paddingRight: 26,
    },
  },
  pickRow: {
    display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
    marginBottom: 12,
  },
  select: {
    flexGrow: 1, minWidth: 200, height: 48, borderRadius: 10,
    backgroundColor: t.surface, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    color: t.text, fontSize: 15, paddingLeft: 14, paddingRight: 14, outlineStyle: "none",
    "@media (max-width: 720px)": { minWidth: 0, width: "100%" },
  },
  token: {
    flexGrow: 1, minWidth: 200, height: 48, borderRadius: 10,
    backgroundColor: t.bg, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    color: t.text, fontSize: 15, paddingLeft: 16, paddingRight: 16, outlineStyle: "none",
  },
  /* Owner WhatsApp: country-code select + local number on one row. */
  waRow: {
    display: "flex", gap: 8, alignItems: "center", flexWrap: "nowrap",
    minWidth: 240, width: "100%",
    "@media (max-width: 720px)": { minWidth: 0, width: "100%" },
  },
  waCc: {
    width: 150, flexShrink: 0, minWidth: 140,
    "@media (max-width: 720px)": { width: 120 },
  },
  waNum: {
    flexGrow: 1, minWidth: 0, width: "auto",
  },
  loginCard: {
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    borderRadius: 14, backgroundColor: t.surface, display: "grid", gap: 12,
    paddingTop: 16, paddingBottom: 16, paddingLeft: 16, paddingRight: 16,
    "@media (min-width: 720px)": { paddingTop: 20, paddingBottom: 20, paddingLeft: 20, paddingRight: 20 },
  },
  ownerBar: {
    display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between",
    flexWrap: "wrap", paddingBottom: 12,
    borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: t.line,
    "@media (min-width: 901px)": { justifyContent: "flex-end" },
  },
  ownerHint: {
    "@media (min-width: 901px)": { display: "none" },
  },
  cta: {
    display: "flex", alignItems: "center", justifyContent: "center",
    flexGrow: 1, minWidth: 0, height: 50, borderRadius: 10,
    backgroundColor: t.primary, color: t.primaryInk,
    fontSize: 16, fontWeight: 800, borderStyle: "none", cursor: "pointer",
    textDecoration: "none",
    boxShadow: "0 6px 20px rgba(185,217,60,.25)",
    ":active": { transform: "scale(.99)" },
  },
  ctaGhost: {
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: 6, flexGrow: 1, minWidth: 0, height: 50, borderRadius: 10,
    backgroundColor: "transparent", color: t.wa,
    borderWidth: 1, borderStyle: "solid", borderColor: t.wa,
    fontSize: 15, fontWeight: 700, cursor: "pointer",
    textDecoration: "none",
    ":active": { backgroundColor: t.wa, color: "#06280f" },
  },
  gate: { textAlign: "center", marginTop: 20, marginBottom: 8 },
  catbox: {
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    borderRadius: 14, backgroundColor: t.surface, display: "grid", gap: 10,
    paddingTop: 14, paddingBottom: 14, paddingLeft: 14, paddingRight: 14,
    marginTop: 14, marginBottom: 14,
    "@media (min-width: 720px)": { paddingTop: 18, paddingBottom: 18, paddingLeft: 20, paddingRight: 20 },
  },
  catboxTitle: { marginTop: 0, marginBottom: 0, fontFamily: t.fontHead, fontSize: 15, fontWeight: 700, color: t.text },
  catList: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 },
  catChip: {
    display: "flex", alignItems: "center", gap: 6,
    padding: 4, paddingRight: 10, borderRadius: 10,
    backgroundColor: t.bg, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    color: t.text, fontSize: 13,
  },
  catChipImg: { width: 32, height: 32, objectFit: "cover", borderRadius: 8, display: "block" },
});

export const timeline = stylex.create({
  head: { marginTop: 10, marginBottom: 6, fontSize: ".85rem", color: t.muted },
  row: {
    display: "flex", gap: 8, overflowX: "auto", paddingTop: 4, paddingBottom: 4,
    alignItems: "center",
    "@media (max-width: 720px)": {
      position: "sticky", bottom: 10, zIndex: 5,
      backgroundColor: t.surface,
      borderWidth: 1, borderStyle: "solid", borderColor: t.line,
      borderRadius: 16, padding: 8,
      boxShadow: "0 8px 28px rgba(0,0,0,.45)",
    },
  },
  add: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    flexShrink: 0, width: 64, height: 64, borderRadius: 10,
    backgroundColor: t.primary, color: t.primaryInk, cursor: "pointer",
    "@media (max-width: 720px)": { width: 54, height: 54 },
  },
  addIcon: { fontSize: 24, fontWeight: 700, lineHeight: 1 },
  addLabel: { fontSize: 10, fontWeight: 700 },
  take: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 2, flexShrink: 0, width: 64, height: 64, borderRadius: 10,
    backgroundColor: t.surface, color: t.text, cursor: "pointer",
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    "@media (max-width: 720px)": { width: 54, height: 54 },
  },
  takeIcon: { display: "flex", lineHeight: 1 },
  item: {
    borderWidth: 2, borderStyle: "solid", borderColor: "transparent",
    borderRadius: 8, padding: 0, backgroundColor: "transparent",
    cursor: "pointer", flexShrink: 0,
  },
  itemImg: {
    width: 64, height: 64, objectFit: "cover", borderRadius: 6, display: "block",
    "@media (max-width: 720px)": { width: 54, height: 54 },
  },
  itemOn: { borderColor: t.primary },
});

/* Product + user-photo duo: two cards side by side on desktop, swipeable
   track on mobile (second card peeks + arrow hints the swipe). */
export const duo = stylex.create({
  track: {
    position: "relative", display: "grid",
    gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start",
    "@media (max-width: 720px)": {
      display: "flex", overflowX: "auto", gap: 12,
      scrollSnapType: "x mandatory", paddingBottom: 4,
      scrollbarWidth: "none",
      "::-webkit-scrollbar": { display: "none" },
    },
  },
  cell: {
    minWidth: 0, maxWidth: "100%", overflow: "hidden",
    "@media (max-width: 720px)": { minWidth: "100%", maxWidth: "100%", flexShrink: 0, scrollSnapAlign: "start" },
  },
  user: {
    position: "relative", width: "100%", maxWidth: "min(100%, 52vh)",
    marginLeft: "auto", marginRight: "auto", aspectRatio: "3 / 4",
    borderRadius: 12, overflow: "hidden", backgroundColor: t.line,
    /* Full-bleed on mobile, but height-capped so the whole studio page
       (ribbon + card + timeline + CTA) fits one phone viewport. */
    "@media (max-width: 720px)": { maxWidth: "none", maxHeight: "max(min(52vh, calc(100dvh - 420px)), 220px)" },
    ":fullscreen": {
      width: "100%", height: "100%", maxWidth: "none", maxHeight: "none",
      borderRadius: 0, backgroundColor: "#000", aspectRatio: "auto",
    },
  },
  userImg: {
    position: "absolute", left: 0, top: 0, width: "100%", maxWidth: "100%", height: "100%",
    objectFit: "cover", display: "block",
  },
  userEmpty: {
    position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
    display: "flex", alignItems: "center", justifyContent: "center",
    textAlign: "center", margin: 0, padding: 12, boxSizing: "border-box",
    color: t.muted, fontSize: 13,
  },
  /* Duplicate mini ribbon inside the user card: only while empty. */
  ustrip: {
    position: "absolute", left: 8, right: 8, bottom: 8, zIndex: 1,
    display: "flex", gap: 6, alignItems: "center",
    overflowX: "auto", padding: 6, borderRadius: 10,
    backgroundColor: "rgba(0,0,0,.55)",
    scrollbarWidth: "none",
    "::-webkit-scrollbar": { display: "none" },
  },
  arrow: {
    display: "none",
    "@media (max-width: 720px)": {
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "absolute", right: 8, top: "40%", width: 40, height: 40,
      borderRadius: 10, borderStyle: "none", cursor: "pointer",
      backgroundColor: "rgba(185,217,60,.85)", color: t.primaryInk,
      fontSize: 22, fontWeight: 700,
      boxShadow: "0 4px 14px rgba(0,0,0,.45)",
    },
  },
  /* Caps the product gallery inside the duo so the whole card fits the
     viewport height instead of over-expanding past full view.
     Full-bleed on mobile so no dark gaps show at the sides. */
  fit: {
    width: "100%", maxWidth: "min(100%, 52vh)",
    marginLeft: "auto", marginRight: "auto",
    "@media (max-width: 720px)": {
      maxWidth: "none",
      /* Shrink only as much as needed: the other studio blocks take
         ~420px, so cap the frame to what is left of the viewport. */
      maxHeight: "max(min(52vh, calc(100dvh - 420px)), 220px)",
    },
  },
  /* Small attached title on top of each duo box, every viewport. */
  boxTitle: {
    marginTop: 0, marginBottom: 6, marginLeft: 0, marginRight: 0,
    fontFamily: t.fontHead, fontSize: 13, fontWeight: 700, color: t.text,
  },
  /* Duo card title row: name left, garment sizes right. */
  gHead: {
    display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6,
  },
  gTitle: {
    marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
    fontFamily: t.fontHead, fontSize: 13, fontWeight: 700, color: t.text,
  },
});
export const compare = stylex.create({
  frame: {
    position: "relative", width: "100%", maxWidth: 440,
    aspectRatio: "3 / 4", borderRadius: 12, overflow: "hidden",
    backgroundColor: t.line, marginTop: 10,
    userSelect: "none", touchAction: "pan-y",
  },
  base: {
    position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
    objectFit: "cover", display: "block",
  },
  top: {
    position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
    objectFit: "cover", display: "block", cursor: "pointer",
    transitionProperty: "opacity", transitionDuration: ".15s",
  },
  cap: { marginTop: 8, marginBottom: 0, fontSize: 13, color: t.muted },
});

/* Category ribbon + expandable panel (studio page). */
export const cats = stylex.create({
  wrap: {
    position: "relative",
  },
  row: {
    display: "flex", gap: 10, overflowX: "auto", paddingTop: 8, paddingBottom: 8,
    scrollbarWidth: "none",
    "::-webkit-scrollbar": { display: "none" },
    "@media (max-width: 720px)": { gap: 8, paddingTop: 4, paddingBottom: 4 },
  },
  /* Scroll affordances: chevrons float over the ribbon edges. They only
     appear when the row actually overflows (JS toggles visibility). */
  arrow: {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    zIndex: 2, width: 28, height: 28, borderRadius: 999,
    display: "flex", alignItems: "center", justifyContent: "center",
    backgroundColor: t.surface, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    color: t.text, fontSize: 14, lineHeight: 1, cursor: "pointer",
    opacity: 0, pointerEvents: "none",
    transitionProperty: "opacity", transitionDuration: ".15s",
    boxShadow: "0 2px 8px rgba(0,0,0,.35)",
  },
  arrowL: { left: 2 },
  arrowR: { right: 2 },
  arrowOn: { opacity: 1, pointerEvents: "auto" },
  item: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    flexShrink: 0, width: 72, padding: 6, borderRadius: 10, cursor: "pointer",
    backgroundColor: "transparent",
    borderWidth: 2, borderStyle: "solid", borderColor: "transparent",
    "@media (max-width: 720px)": { width: 60, gap: 2, padding: 4 },
  },
  itemOn: { borderColor: t.primary },
  img: {
    width: 56, height: 56, objectFit: "cover", borderRadius: 10, display: "block",
    backgroundColor: t.line,
    "@media (max-width: 720px)": { width: 42, height: 42, borderRadius: 8 },
  },
  imgBlank: {
    display: "flex", alignItems: "center", justifyContent: "center",
    color: t.muted, fontSize: 22, fontWeight: 700,
  },
  label: {
    fontSize: 11, color: t.text, textAlign: "center",
    maxWidth: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  panel: {
    marginTop: 4, marginBottom: 8, padding: 12,
    borderRadius: 12, backgroundColor: t.surface,
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
  },
  q: {
    width: "100%", height: 44, borderRadius: 10, boxSizing: "border-box",
    backgroundColor: t.bg, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    color: t.text, fontSize: 15, paddingLeft: 14, paddingRight: 14, outlineStyle: "none",
  },
  title: { marginTop: 10, marginBottom: 8, marginLeft: 0, marginRight: 0, fontSize: 15, color: t.text },
  /* Products in the chosen category: ONE row, horizontal scroll (the
     same pattern as the ribbon itself — never wraps onto another line). */
  grid: { display: "flex", flexWrap: "nowrap", gap: 10, overflowX: "auto", paddingBottom: 4 },
  mini: {
    flexShrink: 0, width: 104, borderRadius: 10, overflow: "hidden", textDecoration: "none",
    backgroundColor: t.bg, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
  },
  miniImg: { width: "100%", height: 120, objectFit: "cover", display: "block" },
  miniTitle: { display: "block", padding: 6, fontSize: 12, color: t.text },
  miniEmpty: { color: t.muted, fontSize: 13 },
});

export const owner = stylex.create({
  /* Owner panel: a kit card in normal flow. The old absolute-positioned
     desktop grid is gone - it could not shrink and forced horizontal
     scroll on narrow laptops. */
  page: {
    maxWidth: 1100, marginLeft: "auto", marginRight: "auto",
    backgroundColor: t.surface, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    borderRadius: 14, display: "grid", gap: 14,
    paddingTop: 16, paddingBottom: 18, paddingLeft: 14, paddingRight: 14,
    "@media (min-width: 720px)": { gap: 16, paddingLeft: 20, paddingRight: 20 },
  },
  title: {
    fontFamily: t.fontHead, fontSize: 22, fontWeight: 700, color: t.text,
    marginTop: 0, marginBottom: 0,
  },
  /* Bundle form: three photo slots on top, then the fields. One column on
     phones, three on desktops - all in flow, no magic margins. */
  form: {
    display: "grid", gap: 12, gridTemplateColumns: "minmax(0, 1fr)",
    "@media (min-width: 901px)": { gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 },
  },
  wide: { "@media (min-width: 901px)": { gridColumn: "1 / -1" } },
  lab: {
    fontSize: 14, fontWeight: 700, color: t.text, marginTop: 0, marginBottom: 0,
    "@media (min-width: 901px)": { gridRow: 1 },
  },
  lab0: { "@media (min-width: 901px)": { gridColumn: 1 } },
  lab1: { "@media (min-width: 901px)": { gridColumn: 2 } },
  lab2: { "@media (min-width: 901px)": { gridColumn: 3 } },
  labReq: { color: t.primary },
  labOpt: { color: t.muted },
  slot: {
    position: "relative", width: "100%", height: 210, borderRadius: 12,
    backgroundColor: t.line, cursor: "pointer", overflow: "hidden", display: "block",
    "@media (min-width: 901px)": { gridRow: 2, height: 300 },
  },
  slot0: { "@media (min-width: 901px)": { gridColumn: 1 } },
  slot1: { "@media (min-width: 901px)": { gridColumn: 2 } },
  slot2: { "@media (min-width: 901px)": { gridColumn: 3 } },
  slotImg: { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", objectFit: "cover" },
  slotEmpty: {
    position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
  },
  slotPick: {
    width: 84, paddingTop: 10, paddingBottom: 8, paddingLeft: 4, paddingRight: 4, borderRadius: 12,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: t.surface, color: t.text, cursor: "pointer",
    fontFamily: t.fontBody, fontSize: 11, fontWeight: 700,
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
  },
  slotCam: {
    width: 84, paddingTop: 10, paddingBottom: 8, paddingLeft: 4, paddingRight: 4, borderRadius: 12,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: t.primary, color: t.primaryInk, cursor: "pointer",
    fontFamily: t.fontBody, fontSize: 11, fontWeight: 700,
    borderStyle: "none",
  },
  slotUse: {
    width: 84, paddingTop: 10, paddingBottom: 8, paddingLeft: 4, paddingRight: 4, borderRadius: 12,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: t.complement, color: "#fff", cursor: "pointer",
    fontFamily: t.fontBody, fontSize: 11, fontWeight: 700,
    borderStyle: "none",
  },
  slotBadge: {
    position: "absolute", bottom: 8, width: 36, height: 36, borderRadius: 8, zIndex: 2,
    display: "flex", alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,.55)", color: "#fff", cursor: "pointer",
    borderStyle: "none",
  },
  slotRetake: { right: 8 },
  slotRelib: { left: 8 },
  cap: {
    color: t.muted, fontSize: 12, marginTop: 0, marginBottom: 0,
    "@media (min-width: 901px)": { gridRow: 3 },
  },
  cap0: { "@media (min-width: 901px)": { gridColumn: 1 } },
  cap1: { "@media (min-width: 901px)": { gridColumn: 2 } },
  cap2: { "@media (min-width: 901px)": { gridColumn: 3 } },
  field: {
    height: 52, width: "100%", boxSizing: "border-box", borderRadius: 10,
    backgroundColor: t.bg, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    color: t.text, fontSize: 15, paddingLeft: 16, paddingRight: 16, outlineStyle: "none",
  },
  fTitle: { "@media (min-width: 901px)": { gridRow: 4, gridColumn: "1 / -1" } },
  fPrice: { "@media (min-width: 901px)": { gridRow: 5, gridColumn: 1 } },
  fCur: { "@media (min-width: 901px)": { gridRow: 5, gridColumn: 2 } },
  fCat: { "@media (min-width: 901px)": { gridRow: 5, gridColumn: 3 } },
  fSizes: { "@media (min-width: 901px)": { gridRow: 6, gridColumn: 1 } },
  fDesc: { "@media (min-width: 901px)": { gridRow: 6, gridColumn: "2 / -1" } },
  submit: {
    width: "100%", height: 52, borderRadius: 10,
    backgroundColor: t.primary, color: t.primaryInk,
    fontSize: 15, fontWeight: 700, borderStyle: "none", cursor: "pointer",
    "@media (min-width: 901px)": { gridRow: 7, gridColumn: "1 / -1" },
  },
  listLink: { color: t.complement },
});

export const share = stylex.create({
  row: { display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" },
  link: {
    flexGrow: 1, minWidth: 200, padding: 10, borderRadius: 10,
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    backgroundColor: t.bg, color: t.text,
  },
});
