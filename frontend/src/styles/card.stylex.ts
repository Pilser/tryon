import * as stylex from "@stylexjs/stylex";
import { tokens as t } from "./tokens.stylex";

export const card = stylex.create({
  root: {
    position: "relative", width: "100%", minWidth: 0,
    borderRadius: 14, backgroundColor: t.surface,
    borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    overflow: "hidden", paddingBottom: 16,
    transitionProperty: "transform, border-color",
    transitionDuration: ".15s, .15s",
    ":hover": { transform: "translateY(-3px)", borderColor: t.primary },
  },
  media: { display: "block", position: "relative", width: "100%", aspectRatio: "3 / 4", backgroundColor: t.line },
  img: {
    width: "100%", height: "100%", aspectRatio: "3 / 4",
    objectFit: "cover", display: "block", cursor: "zoom-in",
    userSelect: "none", touchAction: "pan-y",
  },
  badgePill: {
    position: "absolute", left: 12, top: 12, width: 70, height: 26,
    borderRadius: 6, backgroundColor: t.complement,
  },
  badge: {
    position: "absolute", left: 12, top: 14, width: 70, margin: 0,
    color: t.text, fontSize: 13, textAlign: "center",
  },
  inset: {
    position: "absolute", right: 10, bottom: 10, width: 60, height: 80,
    borderRadius: 8, backgroundColor: t.line,
    borderWidth: 2, borderStyle: "solid", borderColor: "#f4f7e4",
    padding: 0, overflow: "hidden", cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0,0,0,.45)",
    transitionProperty: "transform",
    transitionDuration: ".12s",
    ":hover": { transform: "scale(1.05)" },
  },
  insetImg: { width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" },
  caption: {
    margin: 0, paddingLeft: 16, paddingRight: 16, paddingTop: 8,
    fontSize: 11, color: t.muted, minHeight: 28,
  },
  title: {
    margin: 0, paddingLeft: 16, paddingRight: 16, paddingTop: 2,
    color: t.text, fontFamily: t.fontHead, fontSize: 20, lineHeight: 1.2,
  },
  /* Name + size chips on one row, both flush (no double padding). */
  head: {
    display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minWidth: 0,
    paddingLeft: 16, paddingRight: 16, paddingTop: 2,
  },
  titleFlush: {
    margin: 0, minWidth: 0,
    color: t.text, fontFamily: t.fontHead, fontSize: 20, lineHeight: 1.2,
  },
  price: {
    margin: 0, paddingLeft: 16, paddingRight: 16, paddingTop: 4,
    color: t.primary, fontFamily: t.fontHead, fontSize: 16, fontWeight: 700,
  },
  tryon: {
    display: "flex", alignItems: "center", justifyContent: "center",
    marginLeft: 16, marginRight: 16, marginTop: 12, width: "calc(100% - 32px)", height: 44,
    borderRadius: 10, backgroundColor: t.primary, textDecoration: "none",
  },
  tryonLabel: { color: t.primaryInk, fontSize: 15, fontWeight: 700 },
  inquire: {
    display: "flex", alignItems: "center", justifyContent: "center",
    marginLeft: 16, marginRight: 16, marginTop: 8, width: "calc(100% - 32px)", height: 44,
    borderRadius: 10, backgroundColor: "transparent",
    borderWidth: 1, borderStyle: "solid", borderColor: t.wa, textDecoration: "none",
  },
  inquireLabel: { color: t.wa, fontSize: 15, fontWeight: 700 },
});

/* Detail-page gallery: same interaction, larger frame. */
export const gallery = stylex.create({
  root: { width: "100%" },
  frame: {
    position: "relative", width: "100%", maxWidth: "100%", aspectRatio: "3 / 4",
    borderRadius: 12, overflow: "hidden", backgroundColor: "#2c3319",
    borderWidth: 1, borderStyle: "solid", borderColor: "#2c3319",
    "@media (max-width: 720px)": { maxHeight: "max(min(52vh, calc(100dvh - 420px)), 220px)" },
    ":fullscreen": {
      width: "100%", height: "100%", aspectRatio: "auto", maxHeight: "none",
      borderRadius: 0, borderStyle: "none", backgroundColor: "#000",
    },
  },
  fsBtn: {
    position: "absolute", right: 10, top: 10, width: 36, height: 36, zIndex: 2,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 8, borderStyle: "none", cursor: "pointer",
    backgroundColor: "rgba(0,0,0,.55)", color: "#fff",
  },
  main: {
    width: "100%", maxWidth: "100%", height: "100%", objectFit: "cover", display: "block",
    userSelect: "none", touchAction: "pan-y", cursor: "pointer",
  },
  inset: {
    position: "absolute", right: 14, bottom: 14, width: 88, height: 116,
    borderRadius: 8, overflow: "hidden", padding: 0, cursor: "pointer",
    borderWidth: 2, borderStyle: "solid", borderColor: "#f4f7e4",
    boxShadow: "0 4px 14px rgba(0,0,0,.45)",
  },
  insetImg: { width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" },
  cap: { marginTop: 0, marginBottom: 6, fontSize: 12, color: "#9aa07e" },
  hint: { marginTop: 4, marginBottom: 0, fontSize: 11, color: "#9aa07e", opacity: 0.85 },
});
