/* styles/platform.stylex.ts - platform-only slots the shared kit does not
   carry: form fields, the plat_ token code row, status chips and the
   admin tabs. Every rule stops at the olive tokens; no literal colours
   are re-invented here. */
import * as stylex from "@stylexjs/stylex";
import { tokens as t } from "../../../../../frontend/src/styles/tokens.stylex";

export const pf = stylex.create({
  /* Form field: the studio owner-form metrics (48px, 10px radius, dark
     fill). Full width - it lives in kit page grids, never beside itself. */
  field: {
    height: 48, width: "100%", boxSizing: "border-box", borderRadius: 10,
    backgroundColor: t.bg, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    color: t.text, fontFamily: t.fontBody, fontSize: 15,
    paddingLeft: 14, paddingRight: 14, outlineStyle: "none",
    ":focus": { borderColor: t.primary },
  },
  /* Field + button on one line on desktops, stacked on phones. */
  fieldRow: {
    display: "grid", gap: 10, gridTemplateColumns: "minmax(0, 1fr)", alignItems: "center",
    "@media (min-width: 720px)": { gridTemplateColumns: "minmax(0, 1fr) auto" },
  },
  label: {
    fontSize: 14, fontWeight: 700, color: t.text, fontFamily: t.fontBody,
    marginTop: 0, marginBottom: 0,
  },
  /* Small allowance input: own width, full width on phones like buttons. */
  num: {
    width: 110, height: 44, boxSizing: "border-box", borderRadius: 10,
    backgroundColor: t.bg, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    color: t.text, fontFamily: t.fontBody, fontSize: 15, textAlign: "center",
    paddingLeft: 8, paddingRight: 8, outlineStyle: "none",
    "@media (max-width: 620px)": { width: "100%" },
    ":focus": { borderColor: t.primary },
  },
  /* The plat_ sign-in token a mint for a row, one copyable strip. */
  codeBox: {
    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
    backgroundColor: t.bg, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    borderRadius: 10, padding: "8px 12px",
  },
  code: {
    fontFamily: "ui-monospace, monospace", fontSize: 13, color: t.complement,
    wordBreak: "break-all",
  },
  /* Status chips: same little capsule the dashboards use, colour from
     tokens only (olive = healthy, red = spent/suspended). */
  chip: {
    fontSize: 12, fontWeight: 700, paddingTop: 2, paddingBottom: 2,
    paddingLeft: 8, paddingRight: 8, borderRadius: 7, whiteSpace: "nowrap",
    backgroundColor: t.line, color: t.text,
  },
  chipGood: { color: t.primary },
  chipBad: { color: t.danger },
  chipAdmin: { color: t.complement },
  /* Chip row: the little capsule line under a user's name. */
  chips: {
    display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap",
    verticalAlign: "middle",
  },
  /* Tabs (pending / approved): square like buttons, 10px radius. */
  tabs: { display: "flex", gap: 8, flexWrap: "wrap" },
  tab: {
    padding: "8px 14px", minHeight: 40, borderRadius: 10,
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    backgroundColor: t.surface, color: t.muted, fontFamily: t.fontBody,
    fontSize: 14, fontWeight: 700, cursor: "pointer",
    ":focus": { borderColor: t.primary },
  },
  tabOn: { borderColor: t.primary, color: t.text },

  /* ---------------------------------------------------- console chrome --- */
  /* The wider console shell (the owner console uses u.page). */
  pageWide: {
    maxWidth: 1360, marginInline: "auto", display: "grid", gap: 14,
    paddingLeft: 14, paddingRight: 14, paddingTop: 16, paddingBottom: 40,
    "@media (min-width: 720px)": { paddingLeft: 26, paddingRight: 26, paddingTop: 26 },
  },
  /* The row under the tab strip: search, filter chips, the count. */
  toolbar: {
    display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
    paddingTop: 4, paddingBottom: 4,
  },
  /* The search input of a toolbar. */
  search: {
    height: 40, width: "100%", maxWidth: 320, boxSizing: "border-box", borderRadius: 10,
    backgroundColor: t.bg, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    color: t.text, fontFamily: t.fontBody, fontSize: 14, outlineStyle: "none",
    paddingLeft: 12, paddingRight: 12,
    ":focus": { borderColor: t.primary },
  },
  /* A filter chip that is a button (never a pill): 10px radius. */
  chipBtn: {
    height: 32, paddingLeft: 12, paddingRight: 12, borderRadius: 10,
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    backgroundColor: t.surface, color: t.muted, fontFamily: t.fontBody,
    fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
    ":hover": { borderColor: t.primary, color: t.text },
  },
  /* The chip in its active state. */
  chipBtnOn: { borderColor: t.primary, color: t.primary, backgroundColor: t.surface },
  /* The sticky contextual bulk-action bar (it replaces the filter bar). */
  bulkBar: {
    position: "sticky", bottom: 12, zIndex: 5, display: "flex", gap: 10,
    alignItems: "center", flexWrap: "wrap", backgroundColor: t.surface,
    borderWidth: 1, borderStyle: "solid", borderColor: t.primary, borderRadius: 10,
    paddingTop: 10, paddingBottom: 10, paddingLeft: 12, paddingRight: 12,
  },
  /* The "3 selected" label of the bulk bar. */
  bulkCount: { fontSize: 13, fontWeight: 700, color: t.text },
  /* A link that reads as a link, not as a button. */
  textLink: {
    color: t.complement, fontWeight: 700, fontSize: 13, textDecoration: "none",
    cursor: "pointer", backgroundColor: "transparent", borderWidth: 0,
    borderStyle: "none", paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0,
    fontFamily: t.fontBody,
    ":hover": { textDecoration: "underline" },
  },

  /* ----------------------------------------------------------- tables --- */
  tableWrap: { overflowX: "auto", width: "100%" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: t.fontBody },
  th: {
    position: "sticky", top: 0, backgroundColor: t.surface, textAlign: "left",
    fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em",
    color: t.muted, paddingTop: 8, paddingBottom: 8, paddingLeft: 10, paddingRight: 10,
    borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: t.line,
    whiteSpace: "nowrap",
  },
  td: {
    paddingTop: 8, paddingBottom: 8, paddingLeft: 10, paddingRight: 10,
    borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: t.line,
    verticalAlign: "middle",
  },
  tdNum: { textAlign: "right", fontVariantNumeric: "tabular-nums" },
  check: { width: 36, textAlign: "center" },
  sort: {
    backgroundColor: "transparent", borderWidth: 0, color: "inherit",
    fontFamily: "inherit", fontSize: "inherit", fontWeight: "inherit",
    cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center",
  },

  /* ------------------------------------------------------ tiles, panels --- */
  /* The small-tile grid: the owner scans ten shops in one screen. */
  tileGrid: {
    display: "grid", gap: 10,
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  },
  /* One tile is a button: 10px radius, surface fill, hairline border. */
  tile: {
    display: "grid", gap: 6, textAlign: "left", width: "100%",
    backgroundColor: t.surface, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    borderRadius: 10, paddingTop: 12, paddingBottom: 12, paddingLeft: 12, paddingRight: 12,
    fontFamily: t.fontBody, color: t.text, cursor: "pointer",
    ":hover": { borderColor: t.primary },
  },
  /* The tile that is expanded. */
  tileOn: { borderColor: t.primary },
  /* The "manage" affordance on a tile. */
  tileFoot: {
    fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em",
    color: t.primary,
  },
  /* The expanded manage panel. */
  panel: {
    backgroundColor: t.surface, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    borderRadius: 10, display: "grid", gap: 12,
    paddingTop: 14, paddingBottom: 14, paddingLeft: 14, paddingRight: 14,
  },
  /* The panel's own header (sticky, so the close stays reachable). */
  panelHead: {
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
    flexWrap: "wrap", position: "sticky", top: 0, backgroundColor: t.surface,
    paddingBottom: 10,
  },
  /* The two-column body of the panel (stacked on a phone). */
  split: {
    display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)",
    "@media (min-width: 960px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  },
  /* A key/value list inside a panel. */
  kv: {
    display: "grid", gap: 8, gridTemplateColumns: "auto minmax(0, 1fr)",
    alignItems: "baseline", fontSize: 13,
  },
  kvKey: { color: t.muted, fontSize: 12 },
  kvVal: { color: t.text, fontWeight: 700, wordBreak: "break-word" },

  /* ----------------------------------------------------------- upload --- */
  /* The folder drop target (dashed, 10px radius). */
  dropzone: {
    display: "grid", placeItems: "center", gap: 6, minHeight: 120,
    borderWidth: 1, borderStyle: "dashed", borderColor: t.line, borderRadius: 10,
    backgroundColor: t.bg, paddingTop: 20, paddingBottom: 20,
    paddingLeft: 20, paddingRight: 20, textAlign: "center", color: t.muted,
  },
  /* The drop target while a folder is dragged over it. */
  dropzoneOn: { borderColor: t.primary, color: t.text },
  /* One staged file row. */
  fileRow: {
    display: "grid", gap: 8, paddingTop: 8, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: t.line,
    gridTemplateColumns: "minmax(0, 1fr) auto",
  },
  /* The per-file state text. */
  fileState: { fontSize: 12, fontWeight: 700, color: t.muted, whiteSpace: "nowrap" },
  fileStateBad: { color: t.danger },
  fileStateGood: { color: t.primary },
  /* The progress track and its fill. */
  bar: { height: 4, borderRadius: 2, backgroundColor: t.line, overflow: "hidden" },
  barFill: {
    height: "100%", backgroundColor: t.primary,
    transitionProperty: "width", transitionDuration: ".15s",
  },
  barFillBad: { height: "100%", backgroundColor: t.danger },
  /* The preflight file tree. */
  tree: {
    fontFamily: "ui-monospace, monospace", fontSize: 12, color: t.muted,
    lineHeight: 1.6, whiteSpace: "pre", overflowX: "auto",
  },

  /* ---------------------------------------------------------- confirm --- */
  /* The red confirm box (a destructive action is red and confirmed). */
  confirm: {
    borderWidth: 1, borderStyle: "solid", borderColor: t.danger, borderRadius: 10,
    backgroundColor: t.bg, display: "grid", gap: 10,
    paddingTop: 14, paddingBottom: 14, paddingLeft: 14, paddingRight: 14,
  },
  /* The bulk-assign preview list. */
  diff: {
    fontFamily: "ui-monospace, monospace", fontSize: 12, color: t.muted, lineHeight: 1.7,
  },
});
