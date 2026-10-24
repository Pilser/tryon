/* Fuses literal shell classes (HTML files) to hashed StyleX rules.
   Static shells keep readable class names; this is the ONLY place that
   maps them. Call after every innerHTML render. */
import * as stylex from "@stylexjs/stylex";
import { base } from "./styles/base.stylex";
import { card, gallery } from "./styles/card.stylex";
import { landing } from "./styles/landing.stylex";
import { studio, timeline, owner, share, compare, duo } from "./styles/panels.stylex";
import { dash, quota } from "./styles/dash.stylex";
import { ui } from "./styles/ui.stylex";

const MAP: Array<[string, any[]]> = [
  ["body", [base.body]],
  ["*", [base.reset]],
  [".landing", [landing.page]],
  [".topbar", [base.topbar]],  [".brand", [base.brand]],
  [".nav-back", [base.navBack]],
  [".studio-link", [base.studioLink]],
  [".search-toggle", [base.searchToggle]],
  [".hero-title", [landing.heroTitle]],
  [".hero-sub", [landing.heroSub]],
  [".glow", [landing.glow]],
  [".search", [landing.search]],
  [".search-icon", [landing.searchIcon]],
  [".search-input", [landing.searchInput]],
  [".cat-sel", [landing.catSel]],
  [".search-go", [landing.searchGo]],
  [".count", [landing.count]],
  [".grid", [landing.grid]],
  [".btn.primary", [base.btn, base.btnPrimary]],
  [".btn.wa", [base.btn, base.btnWa]],
  [".btn.secondary", [base.btn, base.btnSecondary]],
  [".btn.danger", [base.btn, base.btnDanger]],
  [".btn", [base.btn]],
  [".icon-btn", [base.iconBtn]],
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
  [".page", [studio.page]],
  [".st-pick-row", [studio.pickRow]],
  [".st-select", [studio.select]],
  [".owner-token", [studio.token]],
  [".login-card", [studio.loginCard]],
  [".owner-bar", [studio.ownerBar]],
  [".owner-bar .hint", [studio.ownerHint]],
  [".owner-gate", [studio.gate]],
  [".owner-gate a", [owner.listLink]],
  [".catbox", [studio.catbox]],
  [".catbox-title", [studio.catboxTitle]],
  [".cat-in", [studio.token]],
  [".cat-sel", [studio.select]],
  [".wa-row", [studio.waRow]],
  [".wa-cc", [studio.waCc]],
  [".wa-num", [studio.waNum]],
  [".dash-head", [dash.head]],
  [".dash-page", [ui.page]],
  [".dash-header", [ui.header]],
  [".page-head", [ui.header]],
  [".page-title", [ui.h1]],
  [".page-lead", [ui.lead]],
  [".dash-h1", [ui.h1]],
  [".dash-lead", [ui.lead]],
  [".dash-card", [ui.card]],
  [".dash-card-title", [ui.cardTitle]],
  [".dash-lead-row", [ui.rowSub]],
  [".dash-hairline", [ui.hairline]],
  [".size-row", [ui.sizeRow]],
  [".size-label", [ui.sizeLabel]],
  [".size-chip", [ui.sizeChip]],
  [".card-head", [card.head]],
  [".title-flush", [card.titleFlush]],
  [".duo-ghead", [duo.gHead]],
  [".duo-gtitle", [duo.gTitle]],
  [".detail-head", [base.detailHead]],
  [".dash-rows", [ui.rows]],
  [".dash-row2", [ui.row]],
  [".dash-row-main", [ui.rowMain]],
  [".dash-row-title", [ui.rowTitle]],
  [".dash-row-sub", [ui.rowSub]],
  [".dash-btnrow", [ui.btnRow]],
  [".dash-empty", [ui.empty]],
  [".quota", [quota.box]],
  [".cat-list", [studio.catList]],
  [".cat-chip", [studio.catChip]],
  [".cat-chip-img", [studio.catChipImg]],
  [".cta", [base.btn, base.btnPrimary, studio.cta]],
  [".cta-ghost", [base.btn, base.btnWa, studio.ctaGhost]],
  [".studio-preview", [studio.preview]],
  [".studio-result-img", [studio.resultImg]],
  [".tl-head", [timeline.head]],
  [".tl-row", [timeline.row]],
  [".tl-add", [timeline.add]],
  [".tl-take", [timeline.take]],
  [".cmp-frame", [compare.frame]],
  [".cmp-base", [compare.base]],
  [".cmp-top", [compare.top]],
  [".cmp-cap", [compare.cap]],
  [".duo-track", [duo.track]],
  [".duo-cell", [duo.cell]],
  [".usercard", [duo.user]],
  [".usercard-img", [duo.userImg]],
  [".usercard-empty", [duo.userEmpty]],
  [".duo-arrow", [duo.arrow]],
  [".duo-fit", [duo.fit]],
  [".usercard-title", [duo.boxTitle]],
  [".userstrip", [duo.ustrip]],
  [".fs-btn", [gallery.fsBtn]],
  [".share-row", [share.row]],
  [".share-link", [share.link]],
  [".bundle", [owner.page]],
  [".bundle .title", [owner.title]],
  [".bundle-form", [owner.form]],
  [".form-wide", [owner.wide]],
  [".lab1", [owner.lab, owner.lab0, owner.labReq]],
  [".lab2", [owner.lab, owner.lab1, owner.labReq]],
  [".lab3", [owner.lab, owner.lab2, owner.labReq]],
  [".slot-garment", [owner.slot, owner.slot0]],
  [".slot-model", [owner.slot, owner.slot1]],
  [".slot-styled", [owner.slot, owner.slot2]],
  [".slot-img", [owner.slotImg]],
  [".slot-empty", [owner.slotEmpty]],
  [".slot-pick", [owner.slotPick]],
  [".slot-cam", [owner.slotCam]],
  [".slot-retake", [owner.slotBadge, owner.slotRetake]],
  [".slot-relib", [owner.slotBadge, owner.slotRelib]],
  [".slot-use", [owner.slotUse]],
  [".cap1", [owner.cap, owner.cap0]],
  [".cap2", [owner.cap, owner.cap1]],
  [".cap3", [owner.cap, owner.cap2]],
  [".f-in", [owner.field]],
  [".f-title", [owner.field, owner.fTitle]],
  [".f-price", [owner.field, owner.fPrice]],
  [".f-cur", [owner.field, owner.fCur]],
  [".f-cat", [owner.field, owner.fCat]],
  [".f-sizes", [owner.field, owner.fSizes]],
  [".f-desc", [owner.field, owner.fDesc]],
  [".submit", [owner.submit]],
  ["#studio-list a", [owner.listLink]],
];

const cx = (ss: any[]): string =>
  ss.map((s) => (stylex.props(s) as { className?: string }).className ?? "").join(" ");

if ((import.meta as any).env?.DEV) {
  // @ts-ignore
  import("/@id/virtual:stylex:runtime").catch(() => {});
}

export { MAP };

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
