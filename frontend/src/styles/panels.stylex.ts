import * as stylex from "@stylexjs/stylex";
import { tokens as t } from "./tokens.stylex";

export const studio = stylex.create({
  root: {
    maxWidth: 1100, marginTop: 22, marginBottom: 22, marginLeft: "auto", marginRight: "auto",
    padding: 24, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    borderRadius: 16, backgroundColor: t.surface,
    "@media (max-width: 720px)": { padding: 16, marginTop: 12, marginBottom: 12, borderRadius: 12 },
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
  gate: { textAlign: "center", marginTop: 20, marginBottom: 8 },
});

export const timeline = stylex.create({
  head: { marginTop: 22, marginBottom: 8, fontSize: "1rem", color: t.muted },
  row: { display: "flex", gap: 8, overflowX: "auto", paddingTop: 4, paddingBottom: 4 },
  item: {
    borderWidth: 2, borderStyle: "solid", borderColor: "transparent",
    borderRadius: 8, padding: 0, backgroundColor: "transparent",
    cursor: "pointer", flexShrink: 0,
  },
  itemImg: { width: 64, height: 64, objectFit: "cover", borderRadius: 6, display: "block" },
  itemOn: { borderColor: t.primary },
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
  list: { marginTop: 560, paddingLeft: 24, paddingRight: 24, paddingBottom: 40 },
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
