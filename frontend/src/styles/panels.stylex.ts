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
    paddingTop: 88, paddingLeft: 22, paddingRight: 22, paddingBottom: 22,
    "@media (max-width: 720px)": { paddingTop: 76, paddingLeft: 12, paddingRight: 12 },
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
    "@media (max-width: 900px)": { position: "static", width: "100%", height: 200, marginTop: 12 },
  },
  slotImg: { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", objectFit: "cover" },
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
