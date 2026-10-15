import * as stylex from "@stylexjs/stylex";
import { tokens as t } from "./tokens.stylex";

export const card = stylex.create({
  root: {
    position: "relative", width: 300, height: 600, flexShrink: 0,
    borderRadius: 16, backgroundColor: t.surface,
  },
  img: {
    position: "absolute", left: 0, top: 0, width: 300, height: 400,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    objectFit: "cover", display: "block", cursor: "zoom-in",
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
    position: "absolute", left: 216, top: 292, width: 72, height: 96,
    borderRadius: 8, backgroundColor: t.line,
    borderWidth: 2, borderStyle: "solid", borderColor: t.surface,
    padding: 0, overflow: "hidden", cursor: "pointer",
  },
  insetImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  caption: {
    position: "absolute", left: 16, top: 398, width: 268, margin: 0,
    fontSize: 11, color: t.muted,
  },
  title: {
    position: "absolute", left: 16, top: 416, width: 268, margin: 0,
    color: t.text, fontFamily: t.fontHead, fontSize: 20,
  },
  price: {
    position: "absolute", left: 16, top: 450, width: 268, margin: 0,
    color: t.primary, fontFamily: t.fontHead, fontSize: 16,
  },
  tryon: {
    position: "absolute", left: 16, top: 492, width: 130, height: 44,
    borderRadius: 10, backgroundColor: t.primary,
    display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none",
  },
  tryonLabel: { color: t.primaryInk, fontSize: 15 },
  inquire: {
    position: "absolute", left: 154, top: 492, width: 130, height: 44,
    borderRadius: 10, backgroundColor: t.surface,
    borderWidth: 2, borderStyle: "solid", borderColor: t.wa,
    display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none",
  },
  inquireLabel: { color: t.wa, fontSize: 15 },
});
