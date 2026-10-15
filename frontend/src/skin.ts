/* Fuses literal shell classes (HTML files) to hashed StyleX rules.
   Static shells keep readable class names; this is the ONLY place that
   maps them. Call after every innerHTML render. */
import * as stylex from "@stylexjs/stylex";
import { base } from "./styles/base.stylex";
import { landing } from "./styles/landing.stylex";
import { studio, timeline, admin, share } from "./styles/panels.stylex";

const MAP: Array<[string, any[]]> = [
  ["body", [base.body]],
  ["*", [base.reset]],
  [".landing", [landing.page]],
  [".topbar", [base.topbar]],  [".brand", [base.brand]],
  [".admin-link", [base.adminLink]],
  [".hero-title", [landing.heroTitle]],
  [".hero-sub", [landing.heroSub]],
  [".eyebrow", [landing.eyebrow]],
  [".glow", [landing.glow]],
  [".search", [landing.search]],
  [".search-input", [landing.searchInput]],
  [".pillrow", [landing.pillrow]],
  [".count", [landing.count]],
  [".grid", [landing.grid]],
  [".btn.primary", [base.btn, base.btnPrimary]],
  [".btn.wa", [base.btn, base.btnWa]],
  [".btn.secondary", [base.btn, base.btnSecondary]],
  [".btn", [base.btn]],
  [".price", [base.price]],
  [".row", [base.row]],
  [".hint", [base.hint]],
  [".error", [base.error]],
  [".ok", [base.ok]],
  [".progress", [base.progress]],
  [".detail", [base.detail]],
  [".detail h1", [base.detailTitle]],
  [".detail img", [base.detailImg]],
  [".back", [base.back]],
  [".studio", [studio.root]],
  [".studio-page", [studio.page]],
  [".st-pick-row", [studio.pickRow]],
  [".st-select", [studio.select]],
  [".owner-token", [studio.token]],
  [".login-card", [studio.loginCard]],
  [".owner-bar", [studio.ownerBar]],
  [".owner-gate", [studio.gate]],
  [".owner-gate a", [admin.listLink]],
  [".studio-preview", [studio.preview]],
  [".studio-result-img", [studio.resultImg]],
  [".tl-head", [timeline.head]],
  [".tl-row", [timeline.row]],
  [".share-row", [share.row]],
  [".share-link", [share.link]],
  [".bundle", [admin.page]],
  [".bundle .title", [admin.title]],
  [".lab1", [admin.lab, admin.lab0, admin.labReq]],
  [".lab2", [admin.lab, admin.lab1, admin.labReq]],
  [".lab3", [admin.lab, admin.lab2, admin.labOpt]],
  [".slot-garment", [admin.slot, admin.slot0]],
  [".slot-model", [admin.slot, admin.slot1]],
  [".slot-styled", [admin.slot, admin.slot2]],
  [".slot-img", [admin.slotImg]],
  [".cap1", [admin.cap, admin.cap0]],
  [".cap2", [admin.cap, admin.cap1]],
  [".cap3", [admin.cap, admin.cap2]],
  [".btn-photo", [admin.photoBtn]],
  [".btn-cam", [admin.camBtn]],
  [".f-in", [admin.field]],
  [".f-title", [admin.field, admin.fTitle]],
  [".f-price", [admin.field, admin.fPrice]],
  [".f-cat", [admin.field, admin.fCat]],
  [".f-sizes", [admin.field, admin.fSizes]],
  [".f-desc", [admin.field, admin.fDesc]],
  [".submit", [admin.submit]],
  [".bundle .note", [admin.note]],
  ["#admin-list", [admin.list]],
  ["#admin-list a", [admin.listLink]],
];

const cx = (ss: any[]): string =>
  ss.map((s) => (stylex.props(s) as { className?: string }).className ?? "").join(" ");

export function skin(scope: ParentNode = document): void {
  for (const [sel, styles] of MAP) {
    scope.querySelectorAll(sel).forEach((n) => {
      if (typeof (n as Element).className !== "string") return; // skip SVG nodes
      const extra = cx(styles);
      const have = new Set(((n as Element).className as string).split(/\s+/));
      for (const t of extra.split(" ")) {
        if (t && !have.has(t)) {
          (n as Element).className += " " + t;
          have.add(t);
        }
      }
    });
  }
}
