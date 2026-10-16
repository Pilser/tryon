import * as stylex from "@stylexjs/stylex";
import { tokens as t } from "./tokens.stylex";

export const studio = stylex.create({
  root: {
    maxWidth: 1100, marginTop: 8, marginBottom: 8, marginLeft: "auto", marginRight: "auto",
    padding: 12, backgroundColor: "transparent",
    "@media (max-width: 720px)": { padding: 8 },
  },
  preview: { maxWidth: 280, borderRadius: 8 },
  resultImg: { maxWidth: "100%", borderRadius: 12 },
  page: {
    maxWidth: 1100, marginLeft: "auto", marginRight: "auto",
    paddingTop: 66, paddingLeft: 22, paddingRight: 22, paddingBottom: 22,
    "@media (max-width: 720px)": { paddingTop: 62, paddingLeft: 12, paddingRight: 12 },
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
  loginCard: {
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    borderRadius: 16, backgroundColor: t.surface,
    padding: 24, marginBottom: 22,
    "@media (max-width: 720px)": { padding: 16, borderRadius: 12 },
  },
  ownerBar: {
    display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between",
    flexWrap: "wrap", marginBottom: 4,
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
    borderRadius: 12, backgroundColor: t.surface,
    padding: 16, marginTop: 12, marginBottom: 16,
  },
  /* Only the first box after the bundle form needs clearance above the
     desktop absolute field grid; boxes after each other sit tight. */
  catboxFirst: {
    marginTop: 440,
    "@media (max-width: 900px)": { marginTop: 12 },
  },
  catboxTitle: { marginTop: 0, marginBottom: 8, fontSize: 16, color: t.text },
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
  },
  addIcon: { fontSize: 24, fontWeight: 700, lineHeight: 1 },
  addLabel: { fontSize: 10, fontWeight: 700 },
  take: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 2, flexShrink: 0, width: 64, height: 64, borderRadius: 10,
    backgroundColor: t.surface, color: t.text, cursor: "pointer",
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
  },
  takeIcon: { display: "flex", lineHeight: 1 },
  item: {
    borderWidth: 2, borderStyle: "solid", borderColor: "transparent",
    borderRadius: 8, padding: 0, backgroundColor: "transparent",
    cursor: "pointer", flexShrink: 0,
  },
  itemImg: { width: 64, height: 64, objectFit: "cover", borderRadius: 6, display: "block" },
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
    "@media (max-width: 720px)": { maxWidth: "none" },
    ":fullscreen": {
      width: "100%", height: "100%", maxWidth: "none",
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
    "@media (max-width: 720px)": { maxWidth: "none" },
  },
  /* Small attached title on top of each duo box, every viewport. */
  boxTitle: {
    marginTop: 0, marginBottom: 6, marginLeft: 0, marginRight: 0,
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
  row: {
    display: "flex", gap: 10, overflowX: "auto", paddingTop: 8, paddingBottom: 8,
    scrollbarWidth: "none",
    "::-webkit-scrollbar": { display: "none" },
  },
  item: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    flexShrink: 0, width: 72, padding: 6, borderRadius: 10, cursor: "pointer",
    backgroundColor: "transparent",
    borderWidth: 2, borderStyle: "solid", borderColor: "transparent",
  },
  itemOn: { borderColor: t.primary },
  img: {
    width: 56, height: 56, objectFit: "cover", borderRadius: 10, display: "block",
    backgroundColor: t.line,
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
  grid: { display: "flex", flexWrap: "wrap", gap: 10 },
  mini: {
    width: 104, borderRadius: 10, overflow: "hidden", textDecoration: "none",
    backgroundColor: t.bg, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
  },
  miniImg: { width: "100%", height: 120, objectFit: "cover", display: "block" },
  miniTitle: { display: "block", padding: 6, fontSize: 12, color: t.text },
  miniEmpty: { color: t.muted, fontSize: 13 },
});

export const owner = stylex.create({
  page: {
    position: "relative", maxWidth: 1200, minHeight: 560,
    marginTop: 64, marginBottom: 0, marginLeft: "auto", marginRight: "auto",
    paddingTop: 24, paddingBottom: 24, paddingLeft: 24, paddingRight: 24,
  },
  title: {
    "@media (max-width: 900px)": { position: "static" }, position: "absolute", left: 24, top: 24, fontFamily: t.fontHead, fontSize: 28, margin: 0 },
  lab: {
    "@media (max-width: 900px)": { position: "static", marginTop: 16 }, position: "absolute", top: 90, fontSize: 15, margin: 0 },
  lab0: { left: 24 },
  lab1: { left: 264 },
  lab2: { left: 504 },
  labReq: { color: t.primary },
  labOpt: { color: t.muted },
  slot: {
    position: "absolute", top: 150, width: 216, height: 270, borderRadius: 8,
    backgroundColor: t.line, cursor: "pointer", overflow: "hidden", display: "block",
    "@media (max-width: 900px)": { position: "relative", left: 0, top: "auto", width: "100%", height: 200, marginTop: 12 },
  },
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
  camOv: {
    position: "fixed", left: 0, top: 0, width: "100%", height: "100dvh",
    zIndex: 50, backgroundColor: "#000", overflow: "hidden",
  },
  camVideo: {
    position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
    objectFit: "cover", display: "block", backgroundColor: "#000",
  },
  camBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    display: "flex", gap: 12, alignItems: "center", justifyContent: "center",
    paddingTop: 16, paddingBottom: 32, paddingLeft: 16, paddingRight: 16,
  },
  camSnap: {
    minHeight: 48, paddingLeft: 22, paddingRight: 22, borderRadius: 10,
    backgroundColor: t.primary, color: t.primaryInk,
    fontSize: 15, fontWeight: 700, borderStyle: "none", cursor: "pointer",
  },
  camCancel: {
    minHeight: 48, paddingLeft: 22, paddingRight: 22, borderRadius: 10,
    backgroundColor: t.surface, color: t.text, cursor: "pointer",
    borderWidth: 1, borderStyle: "solid", borderColor: t.line, fontSize: 15,
  },
  cap: { position: "absolute", top: 428, color: t.muted, fontSize: 13, margin: 0,
    "@media (max-width: 900px)": { position: "static", marginTop: 4 } },
  cap0: { left: 24 },
  cap1: { left: 264 },
  cap2: { left: 504 },
  field: {
    "@media (max-width: 900px)": { position: "static", width: "100%", marginTop: 12 },
    position: "absolute", height: 52, borderRadius: 10, backgroundColor: t.surface,
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    color: t.text, fontSize: 15, paddingLeft: 18, paddingRight: 18, outlineStyle: "none",
  },
  photoBtn: {
    "@media (max-width: 900px)": { position: "static", width: "100%", marginTop: 12 },
    position: "absolute", left: 24, top: 470, width: 180, height: 48,
    borderRadius: 10, backgroundColor: t.primary, color: t.primaryInk,
    fontSize: 15, fontWeight: 700, borderStyle: "none", cursor: "pointer",
  },
  camBtn: {
    "@media (max-width: 900px)": { position: "static", width: "100%", marginTop: 12 },
    position: "absolute", left: 216, top: 470, width: 180, height: 48,
    borderRadius: 10, backgroundColor: t.surface,
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    color: t.text, fontSize: 15, cursor: "pointer",
  },
  submit: {
    "@media (max-width: 900px)": { position: "static", width: "100%", marginTop: 16 },
    position: "absolute", left: 760, top: 406, width: 240, height: 52,
    borderRadius: 10, backgroundColor: t.primary, color: t.primaryInk,
    fontSize: 15, fontWeight: 700, borderStyle: "none", cursor: "pointer",
  },
  note: {
    "@media (max-width: 900px)": { position: "static", marginTop: 12 }, position: "absolute", left: 760, top: 474, color: t.muted, fontSize: 13, margin: 0 },
  list: {
    marginTop: 560, paddingLeft: 24, paddingRight: 24, paddingBottom: 40,
    "@media (max-width: 900px)": { marginTop: 16, paddingLeft: 12, paddingRight: 12 },
  },
  listLink: { color: t.complement },
  slot0: { left: 24 },
  slot1: { left: 264 },
  slot2: { left: 504 },
  fTitle: { left: 760, top: 150, width: 416 },
  fPrice: { left: 760, top: 214, width: 416 },
  fCat: { left: 760, top: 278, width: 200 },
  fSizes: { left: 972, top: 278, width: 204 },
  fDesc: { left: 760, top: 342, width: 416 },
});

export const share = stylex.create({
  row: { display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" },
  link: {
    flexGrow: 1, minWidth: 200, padding: 10, borderRadius: 10,
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    backgroundColor: t.bg, color: t.text,
  },
});
