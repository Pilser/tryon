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
    gridTemplateColumns: "minmax(0, 1fr)",
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

  /* Garment sizes: a labelled chip row that sits beside a product name.
     Chips carry their own contrast so a size is never invisible. */
  sizeRow: {
    display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap",
    verticalAlign: "middle",
  },
  sizeLabel: {
    fontSize: 11, fontWeight: 700, color: t.muted, textTransform: "uppercase",
    letterSpacing: ".05em",
  },
  sizeChip: {
    fontSize: 12, fontWeight: 700, paddingTop: 2, paddingBottom: 2,
    paddingLeft: 8, paddingRight: 8, borderRadius: 7, whiteSpace: "nowrap",
    backgroundColor: t.line, color: t.text,
    borderWidth: 1, borderStyle: "solid", borderColor: t.primary,
  },
  /* Name + sizes on one line (wraps to two on narrow cards). */
  inlineHead: {
    display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minWidth: 0,
  },

  /* ------------------------------------------------------------ wait ---
     Waiting feedback: a spinner ring for busy buttons, the generation
     countdown line (relaxes to "took longer than usual" past 10s), the
     pulsing user photo on top of which the countdown runs, and the dims
     a pressed card so a click is visibly parked until data answers. */
});

/** Shared keyframes (outside the kit so elements compose them freely). */
const spinKf = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});
const pulseKf = stylex.keyframes({
  "0%,100%": { opacity: "1" },
  "50%": { opacity: ".55" },
});
const glowKf = stylex.keyframes({
  // violet halo (#8b6fe8 is tokens.complement; literal here because it
  // needs an 8-digit alpha, which a var() reference cannot carry)
  "0%,100%": { boxShadow: "0 0 0 0 #8b6fe844" },
  "50%": { boxShadow: "0 0 0 6px #8b6fe822" },
});
const riseKf = stylex.keyframes({
  from: { opacity: "0", transform: "translateY(10px)" },
  to: { opacity: "1", transform: "none" },
});
/** YouTube-style sweep: a soft highlight slides across the grey block. */
const shimmerKf = stylex.keyframes({
  from: { backgroundPosition: "200% 0" },
  to: { backgroundPosition: "-200% 0" },
});

/** Extra kit exported separately: applied by stylex.props() at runtime. */
export const wait = stylex.create({
  spinner: {
    display: "inline-block", width: 14, height: 14,
    borderWidth: 2, borderStyle: "solid", borderRadius: 999,
    borderColor: t.line, borderTopColor: t.primary,
    animationName: spinKf, animationDuration: ".8s",
    animationTimingFunction: "linear", animationIterationCount: "infinite",
    flexShrink: 0,
  },
  waitLine: { display: "inline-flex", alignItems: "center", gap: 6, color: t.muted, fontSize: 13 },
  waitSlow: { color: t.complement, fontWeight: 600 },
  photoPulse: {
    animationName: pulseKf, animationDuration: "1.2s",
    animationTimingFunction: "ease-in-out", animationIterationCount: "infinite",
  },
  /** The pressed card waiting for its data (owner studio save paths). */
  busyGlow: {
    animationName: glowKf, animationDuration: "1.4s",
    animationTimingFunction: "ease-in-out", animationIterationCount: "infinite",
    opacity: ".7",
  },
  /** Card entrance: grid/shop results rise in, staggered by index. */
  cardEnter: {
    animationName: riseKf, animationDuration: ".38s",
    animationTimingFunction: "cubic-bezier(.2,.7,.3,1)", animationFillMode: "both",
  },
});

/** One stylex bucket per stagger slot. Card 0 is instant; slots 1..8 add
    45ms each, the last slot caps the wait so a long grid still starts. */
export const enterDelays = stylex.create({
  d0: { animationDelay: "0ms" },
  d1: { animationDelay: "45ms" },
  d2: { animationDelay: "90ms" },
  d3: { animationDelay: "135ms" },
  d4: { animationDelay: "180ms" },
  d5: { animationDelay: "225ms" },
  d6: { animationDelay: "270ms" },
  d7: { animationDelay: "315ms" },
  d8: { animationDelay: "420ms" },
});

/** Skeleton placeholder kit: YouTube's loading state, in house colours.
    Blocks carry `sk.box` (grey base + the sweeping highlight); shapes
    (media/bar/btn) size the block to mirror the real element it stands
    in for, so the layout never jumps when data replaces the skeleton. */
export const sk = stylex.create({
  box: {
    backgroundColor: t.line,
    backgroundImage:
      "linear-gradient(100deg, rgba(244,247,228,0) 40%, rgba(244,247,228,.09) 50%, rgba(244,247,228,0) 60%)",
    backgroundSize: "200% 100%",
    backgroundRepeat: "no-repeat",
    animationName: shimmerKf, animationDuration: "1.4s",
    animationTimingFunction: "linear", animationIterationCount: "infinite",
  },
  /** Stands inside the real media frame (aspect ratio comes from it). */
  media: { width: "100%", height: "100%", display: "block" },
  /** Product-frame block when no frame element exists (detail/studio). */
  frame: { width: "100%", aspectRatio: "3 / 4", borderRadius: 12, display: "block" },
  bar: { height: 16, borderRadius: 8, width: "62%", display: "block" },
  barWide: { height: 12, borderRadius: 6, width: "86%", display: "block" },
  barShort: { height: 16, borderRadius: 8, width: "38%", display: "block" },
  btn: { height: 44, borderRadius: 10, width: "100%", display: "block" },
  /** Vertical rhythm for the info side of detail/studio skeletons. */
  stack: {
    display: "grid", gap: 10, alignContent: "start",
    paddingTop: 14, paddingBottom: 14,
  },
});
