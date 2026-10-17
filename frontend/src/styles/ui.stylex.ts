/* styles/ui.stylex.ts - the shared surface kit (workspace-UI language):
   one dark page, cards defined by a hairline border + whitespace instead
   of nested fills, roomy control heights, buttons that never touch, and
   list rows separated by hairlines like a table.

   Every page builds from these primitives so the whole app reads as one
   product. Olive tokens stay the theme; only the surfaces change. */
import * as stylex from "@stylexjs/stylex";
import { tokens as t } from "./tokens.stylex";

export const ui = stylex.create({
  /* ------------------------------------------------------------ page --- */
  page: {
    display: "grid", gap: 14, width: "100%", maxWidth: 1100, marginInline: "auto",
    paddingLeft: 14, paddingRight: 14, paddingTop: 16, paddingBottom: 40,
    "@media (min-width: 720px)": {
      gap: 18, paddingLeft: 26, paddingRight: 26, paddingTop: 26,
    },
  },
  /* Page header: title + lead on the left, action on the right, well
     apart from everything else. */
  header: {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
    gap: 12, flexWrap: "wrap",
  },
  h1: {
    fontFamily: t.fontHead, fontSize: 20, fontWeight: 700, color: t.text,
    marginTop: 0, marginBottom: 4, lineHeight: 1.25,
  },
  lead: { fontSize: 13, color: t.muted, marginTop: 0, marginBottom: 0, lineHeight: 1.5 },

  /* ----------------------------------------------------------- card --- */
  card: {
    backgroundColor: t.surface, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    borderRadius: 14, paddingTop: 14, paddingBottom: 14, paddingLeft: 14, paddingRight: 14,
    display: "grid", gap: 12,
    "@media (min-width: 720px)": {
      paddingTop: 18, paddingBottom: 18, paddingLeft: 20, paddingRight: 20, gap: 14,
    },
  },
  /* Headless card: same surface, no inner gap management. */
  cardFlush: {
    backgroundColor: t.surface, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    borderRadius: 14, paddingTop: 4, paddingBottom: 4, paddingLeft: 0, paddingRight: 0,
    display: "grid", gap: 0,
    "@media (min-width: 720px)": { paddingTop: 6, paddingBottom: 6 },
  },
  cardHead: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 10, flexWrap: "wrap",
    paddingLeft: 14, paddingRight: 14, paddingTop: 10, paddingBottom: 10,
    "@media (min-width: 720px)": { paddingLeft: 20, paddingRight: 20 },
  },
  cardTitle: {
    fontFamily: t.fontHead, fontSize: 15, fontWeight: 700, color: t.text,
    marginTop: 0, marginBottom: 0,
  },
  hairline: {
    height: 1, borderWidth: 0, backgroundColor: t.line, marginTop: 0, marginBottom: 0,
    marginLeft: 14, marginRight: 14,
    "@media (min-width: 720px)": { marginLeft: 20, marginRight: 20 },
  },

  /* ------------------------------------------------------- stat grid --- */
  statGrid: {
    display: "grid", gap: 10, gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    "@media (min-width: 720px)": { gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 },
  },
  stat: {
    display: "grid", gap: 8, textAlign: "left", width: "100%",
    backgroundColor: t.surface, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    borderRadius: 14, paddingTop: 14, paddingBottom: 14, paddingLeft: 14, paddingRight: 14,
    fontFamily: t.fontBody,
    "@media (min-width: 720px)": { paddingLeft: 18, paddingRight: 18 },
  },
  statGo: {
    cursor: "pointer",
    transitionProperty: "border-color, transform", transitionDuration: ".12s, .12s",
    ":hover": { borderColor: t.primary, transform: "translateY(-2px)" },
    ":active": { transform: "translateY(0)" },
  },
  statLabel: { fontSize: 12, color: t.muted, marginTop: 0, marginBottom: 0, lineHeight: 1.35 },
  statValue: {
    fontFamily: t.fontHead, fontSize: 24, fontWeight: 800, color: t.text,
    marginTop: 0, marginBottom: 0, lineHeight: 1.1,
  },
  statRule: { height: 2, width: 44, borderRadius: 2, backgroundColor: t.line, borderWidth: 0, margin: 0 },
  statFoot: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
    fontSize: 11, fontWeight: 700, color: t.primary, marginTop: 0,
  },

  /* --------------------------------------------------------- list row --- */
  rows: { display: "grid", gap: 0 },
  row: {
    display: "grid", gap: 10,
    paddingTop: 12, paddingBottom: 12, paddingLeft: 14, paddingRight: 14,
    "@media (min-width: 720px)": {
      gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: 16,
      paddingLeft: 20, paddingRight: 20,
    },
  },
  rowMain: { display: "grid", gap: 6, minWidth: 0 },
  rowTitle: {
    fontSize: 14, fontWeight: 700, color: t.text, marginTop: 0, marginBottom: 0,
    wordBreak: "break-word",
  },
  rowSub: { fontSize: 12, color: t.muted, marginTop: 0, marginBottom: 0, wordBreak: "break-word" },

  /* --------------------------------------------------------- buttons --- */
  /* Actions never touch: 10px apart, and each one takes the full width on
     phones so a thumb cannot hit the wrong one. */
  btnRow: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  btnGrow: {
    "@media (max-width: 620px)": { width: "100%", flexGrow: 1 },
  },
  btnIcon: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: 40, minHeight: 40, paddingLeft: 10, paddingRight: 10,
    borderRadius: 10, backgroundColor: "transparent", color: t.muted, cursor: "pointer",
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    ":hover": { borderColor: t.primary, color: t.text },
  },

  /* ----------------------------------------------------------- misc --- */
  inlineNote: {
    fontSize: 12, color: t.text, fontWeight: 600, marginTop: 0, marginBottom: 0,
    display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
  },
  empty: {
    fontSize: 13, color: t.muted, textAlign: "center",
    paddingTop: 28, paddingBottom: 28, marginTop: 0, marginBottom: 0,
  },
  meta: { fontSize: 11, color: t.muted, marginTop: 0, marginBottom: 0 },
});
