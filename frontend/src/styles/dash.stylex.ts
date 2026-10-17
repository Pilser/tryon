/* styles/dash.stylex.ts - owner dashboard (usage, devices, tokens,
   settings) and the shopper quota banner. Same olive-oil tokens as the
   rest of the app; no round pills, 10-12px radii. */
import * as stylex from "@stylexjs/stylex";
import { tokens as t } from "./tokens.stylex";

export const dash = stylex.create({
  head: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 12, flexWrap: "wrap", marginBottom: 10,
  },
  tabs: {
    display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6,
    scrollbarWidth: "none",
    "::-webkit-scrollbar": { display: "none" },
  },
  tab: {
    flexShrink: 0, paddingTop: 9, paddingBottom: 9, paddingLeft: 13, paddingRight: 13,
    borderRadius: 10, backgroundColor: "transparent", color: t.muted,
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: t.fontHead,
  },
  tabOn: { backgroundColor: t.primary, color: t.primaryInk, borderColor: t.primary },
  panel: {
    display: "grid", gap: 12, marginTop: 12,
    "@media (max-width: 720px)": { gap: 10 },
  },
  tiles: {
    display: "grid", gap: 10,
    gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))",
  },
  tile: {
    backgroundColor: t.bg, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    borderRadius: 12, paddingTop: 12, paddingBottom: 12, paddingLeft: 14, paddingRight: 14,
  },
  tileN: { fontFamily: t.fontHead, fontSize: 24, fontWeight: 800, color: t.text, lineHeight: 1.1 },
  tileL: {
    fontSize: 11, color: t.muted, textTransform: "uppercase", letterSpacing: ".05em",
    marginTop: 4,
  },
  list: { display: "grid", gap: 8 },
  body: { fontSize: 13, color: t.muted, lineHeight: 1.55, marginTop: 0, marginBottom: 0 },
  row: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 10, flexWrap: "wrap",
    backgroundColor: t.bg, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    borderRadius: 12, paddingTop: 10, paddingBottom: 10, paddingLeft: 12, paddingRight: 12,
  },
  who: { fontSize: 14, fontWeight: 700, color: t.text, wordBreak: "break-word" },
  sub: { fontSize: 12, color: t.muted, wordBreak: "break-word" },
  chips: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" },
  chip: {
    fontSize: 11, fontWeight: 700, paddingTop: 3, paddingBottom: 3, paddingLeft: 8, paddingRight: 8,
    borderRadius: 8, backgroundColor: t.line, color: t.text, whiteSpace: "nowrap",
  },
  chipFree: { backgroundColor: t.line, color: t.text },
  chipPaid: { backgroundColor: t.primary, color: t.primaryInk },
  chipUsed: { backgroundColor: "transparent", color: t.muted, borderWidth: 1, borderStyle: "solid", borderColor: t.line },
  code: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 17, fontWeight: 800, letterSpacing: ".14em", color: t.text,
  },
  form: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  num: {
    width: 96, height: 44, borderRadius: 10, backgroundColor: t.bg,
    borderWidth: 1, borderStyle: "solid", borderColor: t.line, color: t.text,
    fontSize: 15, paddingLeft: 12, paddingRight: 12, outlineStyle: "none",
  },
  note: {
    flexGrow: 1, minWidth: 160, height: 44, borderRadius: 10, backgroundColor: t.bg,
    borderWidth: 1, borderStyle: "solid", borderColor: t.line, color: t.text,
    fontSize: 15, paddingLeft: 12, paddingRight: 12, outlineStyle: "none",
  },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  sectionTitle: {
    fontFamily: t.fontHead, fontSize: 13, fontWeight: 700, color: t.muted,
    textTransform: "uppercase", letterSpacing: ".05em", marginTop: 4,
  },
  minted: {
    borderWidth: 1, borderStyle: "dashed", borderColor: t.primary, borderRadius: 12,
    padding: 12, display: "grid", gap: 8,
  },
  mintedCodes: {
    display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center",
  },
  empty: { fontSize: 13, color: t.muted },
});

export const quota = stylex.create({
  box: {
    marginTop: 14, marginBottom: 4, borderRadius: 12,
    borderWidth: 1, borderStyle: "solid", borderColor: t.primary,
    backgroundColor: t.surface, paddingTop: 14, paddingBottom: 14,
    paddingLeft: 14, paddingRight: 14, display: "grid", gap: 10,
  },
  title: {
    fontFamily: t.fontHead, fontSize: 16, fontWeight: 800, color: t.text,
    marginTop: 0, marginBottom: 0,
  },
  head: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 10, flexWrap: "wrap",
  },
  body: { fontSize: 13, color: t.muted, marginTop: 0, marginBottom: 0, lineHeight: 1.5 },
  panel: { display: "grid", gap: 10, marginTop: 10 },
  strong: { color: t.text, fontWeight: 700 },
  sub: { fontSize: 12, color: t.muted, marginTop: 0, marginBottom: 0 },
  form: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  input: {
    flexGrow: 1, minWidth: 150, height: 46, borderRadius: 10, backgroundColor: t.bg,
    borderWidth: 1, borderStyle: "solid", borderColor: t.line, color: t.text,
    fontSize: 15, paddingLeft: 14, paddingRight: 14, outlineStyle: "none",
  },
  codeInput: {
    width: 130, height: 46, borderRadius: 10, backgroundColor: t.bg,
    borderWidth: 1, borderStyle: "solid", borderColor: t.line, color: t.text,
    fontSize: 18, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase",
    textAlign: "center", paddingLeft: 10, paddingRight: 10, outlineStyle: "none",
  },
  wa: {
    display: "inline-flex", alignItems: "center", gap: 8, height: 46, paddingLeft: 16, paddingRight: 16,
    borderRadius: 10, backgroundColor: t.wa, color: "#06280f",
    fontSize: 15, fontWeight: 800, textDecoration: "none",
  },
  ok: { fontSize: 13, fontWeight: 700, color: t.primary, marginTop: 0, marginBottom: 0 },
  err: { fontSize: 13, fontWeight: 700, color: t.danger, marginTop: 0, marginBottom: 0 },
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
});
