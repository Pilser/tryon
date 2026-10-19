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
});
