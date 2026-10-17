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
  /* Clickable stat tile: hovering lifts it and the caret slides, so the
     eye reads "this number opens that tab". */
  tileGo: {
    cursor: "pointer", textAlign: "left", display: "block", width: "100%",
    fontFamily: t.fontBody,
    transitionProperty: "border-color, transform", transitionDuration: ".12s, .12s",
    ":hover": { borderColor: t.primary, transform: "translateY(-2px)" },
    ":active": { transform: "translateY(0)" },
  },
  tileFoot: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
    fontSize: 11, color: t.primary, fontWeight: 700, marginTop: 6,
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
  /* Chips are self-contained (no runtime merging of two StyleX objects:
     later objects do not override earlier ones once both classes land).
     Green = live/paid, grey = plain info, muted outline = spent,
     red = canceled or blocked. */
  chip: {
    fontSize: 11, fontWeight: 700, paddingTop: 3, paddingBottom: 3,
    paddingLeft: 8, paddingRight: 8, borderRadius: 8, whiteSpace: "nowrap",
    backgroundColor: t.line, color: t.text,
  },
  chipFree: {
    fontSize: 11, fontWeight: 700, paddingTop: 3, paddingBottom: 3,
    paddingLeft: 8, paddingRight: 8, borderRadius: 8, whiteSpace: "nowrap",
    backgroundColor: t.line, color: t.text,
  },
  chipPaid: {
    fontSize: 11, fontWeight: 700, paddingTop: 3, paddingBottom: 3,
    paddingLeft: 8, paddingRight: 8, borderRadius: 8, whiteSpace: "nowrap",
    backgroundColor: t.primary, color: t.primaryInk,
  },
  chipUsed: {
    fontSize: 11, fontWeight: 700, paddingTop: 3, paddingBottom: 3,
    paddingLeft: 8, paddingRight: 8, borderRadius: 8, whiteSpace: "nowrap",
    backgroundColor: "transparent", color: t.muted,
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
  },
  /* Canceled / blocked: red, so a dead code never reads as "fine". */
  chipBad: {
    fontSize: 11, fontWeight: 700, paddingTop: 3, paddingBottom: 3,
    paddingLeft: 8, paddingRight: 8, borderRadius: 8, whiteSpace: "nowrap",
    backgroundColor: "transparent", color: t.danger,
    borderWidth: 1, borderStyle: "solid", borderColor: t.danger,
  },
  /* Numbered step card: colour guides a non-technical owner through the
     code flow (1 make, 2 send, 3 keep track). */
  step: {
    display: "grid", gap: 10, backgroundColor: t.bg,
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    borderRadius: 12, padding: 14,
  },
  stepNow: { borderColor: t.primary },
  stepHead: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  stepNum: {
    width: 26, height: 26, borderRadius: 8, backgroundColor: t.primary, color: t.primaryInk,
    fontFamily: t.fontHead, fontWeight: 800, fontSize: 13,
    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  stepNumOff: { backgroundColor: t.line, color: t.muted },
  stepTitle: {
    fontFamily: t.fontHead, fontSize: 14, fontWeight: 700, color: t.text,
    marginTop: 0, marginBottom: 0,
  },
  /* Big either/or choice (extra try-ons vs unlimited hours). */
  choice: {
    display: "flex", gap: 8, flexWrap: "wrap",
  },
  choiceBtn: {
    flexGrow: 1, minWidth: 150, minHeight: 58, borderRadius: 10, cursor: "pointer",
    backgroundColor: t.surface, color: t.text, textAlign: "left",
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    paddingTop: 9, paddingBottom: 9, paddingLeft: 12, paddingRight: 12,
    fontFamily: t.fontBody, fontSize: 14, fontWeight: 700,
    ":hover": { borderColor: t.primary },
  },
  choiceOn: { borderColor: t.primary, borderWidth: 2, paddingTop: 8, paddingBottom: 8, paddingLeft: 11, paddingRight: 11 },
  choiceHint: { display: "block", fontSize: 11, color: t.muted, fontWeight: 400, marginTop: 3 },
  choiceHintOn: { color: t.primary },
  label: { fontSize: 12, fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: ".05em" },
  /* Filter chips above a list (All / Unused / Used / Canceled). */
  filters: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  filter: {
    fontSize: 12, fontWeight: 700, paddingTop: 7, paddingBottom: 7, paddingLeft: 11, paddingRight: 11,
    borderRadius: 9, backgroundColor: "transparent", color: t.muted, cursor: "pointer",
    borderWidth: 1, borderStyle: "solid", borderColor: t.line, fontFamily: t.fontBody,
    ":hover": { borderColor: t.primary, color: t.text },
  },
  filterOn: { backgroundColor: t.surface, color: t.text, borderColor: t.primary },
  /* Backup storage summary line + per-device chip. */
  summary: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
    flexWrap: "wrap", backgroundColor: t.surface, borderWidth: 1, borderStyle: "dashed",
    borderColor: t.line, borderRadius: 12, paddingTop: 10, paddingBottom: 10,
    paddingLeft: 12, paddingRight: 12,
  },
  /* Photo folder: thumbnails grid, sizes under each (no per-file button). */
  folder: {
    display: "grid", gap: 10, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    borderRadius: 12, backgroundColor: t.bg, padding: 12,
  },
  photoGrid: {
    display: "grid", gap: 8,
    gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
    "@media (min-width: 720px)": { gridTemplateColumns: "repeat(auto-fill, minmax(116px, 1fr))" },
  },
  photo: {
    display: "grid", gap: 4, borderRadius: 10, overflow: "hidden",
    backgroundColor: t.surface, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    padding: 6,
  },
  photoImg: {
    width: "100%", height: 92, objectFit: "cover", borderRadius: 7, display: "block",
    backgroundColor: t.bg,
  },
  photoMeta: { fontSize: 10, color: t.muted, lineHeight: 1.35, wordBreak: "break-word" },
  /* Two-pane layout on desktop: list left, folder right. One column on
     phones, where the folder simply stacks under the users list. */
  cols: {
    display: "grid", gap: 12,
    "@media (min-width: 900px)": { gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", alignItems: "start" },
  },
  /* Device row: stacked on phones, one line on wider screens. */
  devRow: {
    display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8,
    backgroundColor: t.bg, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    borderRadius: 12, paddingTop: 10, paddingBottom: 10, paddingLeft: 12, paddingRight: 12,
    "@media (min-width: 720px)": {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10,
    },
  },
  devActions: { display: "flex", gap: 6, flexWrap: "wrap" },
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
