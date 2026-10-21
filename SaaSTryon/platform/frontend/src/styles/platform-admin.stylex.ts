/* styles/platform-admin.stylex.ts - the slots the ADMIN console needs
   on top of the shared kit (pf.*) and the platform slots (pf.*). They
   live in their own file so the owner console and the landing page
   never fight over the same class names.

   Every rule here is self-contained (StyleX does not merge classes):
   a compact button carries its own border, fill, radius and type, and
   it never inherits the 44px height of the kit button - a 13px table
   row needs a button that fits in it. Colours come from the tokens
   only; the radius is 10 (interactive elements cap at 10). */
import * as stylex from "@stylexjs/stylex";
import { tokens as t } from "../../../../../frontend/src/styles/tokens.stylex";

export const pa = stylex.create({
  /* The compact button of a table row (32px, 10px radius). */
  btnSm: {
    height: 32, boxSizing: "border-box", borderRadius: 10, paddingLeft: 10, paddingRight: 10,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    backgroundColor: t.surface, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    color: t.text, fontFamily: t.fontBody, fontSize: 12, fontWeight: 700,
    cursor: "pointer", whiteSpace: "nowrap", textDecoration: "none",
    ":hover": { borderColor: t.primary },
    ":disabled": { opacity: 0.5, cursor: "not-allowed" },
  },
  /* The red row button: a destructive action stays red. */
  btnSmDanger: {
    height: 32, boxSizing: "border-box", borderRadius: 10, paddingLeft: 10, paddingRight: 10,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    backgroundColor: "transparent", borderWidth: 1, borderStyle: "solid", borderColor: t.danger,
    color: t.danger, fontFamily: t.fontBody, fontSize: 12, fontWeight: 700,
    cursor: "pointer", whiteSpace: "nowrap", textDecoration: "none",
    ":hover": { backgroundColor: t.danger, color: t.primaryInk },
    ":disabled": { opacity: 0.5, cursor: "not-allowed" },
  },
  /* The compact select of a table cell (the target version). */
  selectSm: {
    height: 32, boxSizing: "border-box", borderRadius: 10, paddingLeft: 8, paddingRight: 8,
    backgroundColor: t.bg, borderWidth: 1, borderStyle: "solid", borderColor: t.line,
    color: t.text, fontFamily: t.fontBody, fontSize: 12, outlineStyle: "none",
    ":focus": { borderColor: t.primary },
  },
  /* The small checkbox of a table row. */
  checkSm: {
    width: 16, height: 16, accentColor: t.primary, cursor: "pointer", margin: 0,
  },
  /* The facts line of a dense row: muted, small, never wrapping into
     the next column. */
  fact: {
    fontSize: 12, color: t.muted, fontFamily: t.fontBody, marginTop: 0, marginBottom: 0,
  },
  /* The mono code of a ledger row (the code itself is the row's name). */
  codeCell: {
    fontFamily: "ui-monospace, monospace", fontSize: 13, color: t.complement,
    letterSpacing: ".04em", whiteSpace: "nowrap",
  },
  /* The scroll box of the assignment table on a phone. */
  tableNote: {
    fontSize: 11, color: t.muted, marginTop: 0, marginBottom: 0,
  },
});
