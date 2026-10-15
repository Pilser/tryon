import * as stylex from "@stylexjs/stylex";
import { tokens as t } from "./tokens.stylex";

export const landing = stylex.create({
  page: { position: "relative", maxWidth: 1200, height: 400, marginLeft: "auto", marginRight: "auto" },
  heroTitle: {
    position: "absolute", left: 0, top: 110, width: "100%", margin: 0,
    color: t.text, fontFamily: t.fontHead, fontSize: 40, textAlign: "center",
  },
  heroSub: {
    position: "absolute", left: 0, top: 175, width: "100%", margin: 0,
    color: t.muted, fontSize: 18, textAlign: "center",
  },
  search: {
    position: "absolute", left: "50%", top: 220, width: 600, maxWidth: "calc(100% - 32px)",
    height: 52, transform: "translateX(-50%)", borderRadius: 10,
    backgroundColor: t.surface, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
  },
  searchInput: {
    position: "absolute", left: 24, top: 13, width: "calc(100% - 48px)",
    backgroundColor: "transparent", borderStyle: "none", outlineStyle: "none",
    color: t.text, fontSize: 16,
  },
  pillrow: { position: "absolute", left: 0, top: 290, width: "100%", textAlign: "center" },
  pill: {
    display: "inline-block", minWidth: 90, height: 36, lineHeight: "36px",
    paddingLeft: 16, paddingRight: 16, marginLeft: 6, marginRight: 6,
    borderRadius: 10, backgroundColor: t.surface,
    borderWidth: 1, borderStyle: "solid", borderColor: "transparent",
    color: t.text, fontSize: 15, textDecoration: "none",
  },
  pillAll: { backgroundColor: t.primary, color: t.primaryInk, fontWeight: 700 },
  pillOn: { borderColor: t.primary, color: t.primary },
  count: {
    position: "absolute", left: 0, top: 340, width: "100%", margin: 0,
    color: t.muted, fontSize: 14, textAlign: "center",
  },
  grid: {
    display: "flex", flexWrap: "wrap", gap: 30, justifyContent: "center",
    padding: 22, maxWidth: 1200, marginLeft: "auto", marginRight: "auto",
  },
});
