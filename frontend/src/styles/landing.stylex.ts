import * as stylex from "@stylexjs/stylex";
import { tokens as t } from "./tokens.stylex";

const MOBILE = "@media (max-width: 720px)" as const;

export const landing = stylex.create({
  page: {
    position: "relative", maxWidth: 1200, height: 460,
    marginLeft: "auto", marginRight: "auto", overflow: "hidden",
    [MOBILE]: { height: "auto", paddingBottom: 8 },
  },
  glow: {
    position: "absolute", left: "50%", top: -220, width: 640, height: 420,
    transform: "translateX(-50%)",
    background: "radial-gradient(closest-side, rgba(185,217,60,.16), transparent)",
    pointerEvents: "none",
    [MOBILE]: { display: "none" },
  },
  eyebrow: {
    position: "absolute", left: 0, top: 96, width: "100%", margin: 0,
    textAlign: "center", fontSize: 13, letterSpacing: 2, textTransform: "uppercase",
    color: t.primary, fontWeight: 700,
    [MOBILE]: { position: "static", display: "block", paddingTop: 68, marginBottom: 6 },
  },
  heroTitle: {
    position: "absolute", left: 0, top: 118, width: "100%", margin: 0,
    color: t.text, fontFamily: t.fontHead, fontSize: 52, lineHeight: 1.05, textAlign: "center",
    [MOBILE]: { position: "static", width: "auto", fontSize: 34, paddingLeft: 20, paddingRight: 20 },
  },
  heroSub: {
    position: "absolute", left: 0, top: 208, width: "100%", margin: 0,
    color: t.muted, fontSize: 18, textAlign: "center",
    [MOBILE]: { position: "static", width: "auto", fontSize: 15, marginTop: 10, paddingLeft: 20, paddingRight: 20 },
  },
  search: {
    position: "absolute", left: "50%", top: 262, width: 600, maxWidth: "calc(100% - 32px)",
    height: 52, transform: "translateX(-50%)", borderRadius: 10,
    backgroundColor: t.surface, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    [MOBILE]: { position: "static", transform: "none", width: "auto", marginTop: 18, marginLeft: 16, marginRight: 16 },
  },
  searchInput: {
    position: "absolute", left: 24, top: 13, width: "calc(100% - 48px)",
    backgroundColor: "transparent", borderStyle: "none", outlineStyle: "none",
    color: t.text, fontSize: 16,
  },
  pillrow: {
    position: "absolute", left: 0, top: 332, width: "100%", textAlign: "center",
    [MOBILE]: { position: "static", marginTop: 14, paddingLeft: 12, paddingRight: 12 },
  },
  pill: {
    display: "inline-block", minWidth: 90, height: 36, lineHeight: "36px",
    paddingLeft: 16, paddingRight: 16, marginLeft: 6, marginRight: 6, marginTop: 6,
    boxSizing: "border-box", textAlign: "center", verticalAlign: "top",
    borderRadius: 10, backgroundColor: t.surface,
    borderWidth: 1, borderStyle: "solid", borderColor: "transparent",
    color: t.text, fontSize: 15, textDecoration: "none",
  },
  pillAll: { backgroundColor: t.primary, color: t.primaryInk, fontWeight: 700 },
  pillOn: { borderColor: t.primary, color: t.primary },
  count: {
    position: "absolute", left: 0, top: 384, width: "100%", margin: 0,
    color: t.muted, fontSize: 14, textAlign: "center",
    [MOBILE]: { position: "static", width: "auto", marginTop: 10 },
  },
  grid: {
    display: "flex", flexWrap: "wrap", gap: 30, justifyContent: "center",
    padding: 22, maxWidth: 1200, marginLeft: "auto", marginRight: "auto",
    [MOBILE]: { gap: 16, padding: 12 },
  },
});
