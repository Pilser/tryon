/* components/dash-tokens.ts - the Unlock codes tab. Non-technical owner:
   three numbered steps (1 pick what the code does, 2 create, 3 send) with
   colour as the guide - green = live code, grey = used, red = canceled or
   destructive. Lists are filtered by chips, and deletion always acts on
   the filtered group, never one row at a time. */
import * as stylex from "@stylexjs/stylex";
import { cancelToken, deleteToken, mintTokens, purgeTokens, type UsageOut } from "../core/api";
import { esc } from "../core/format";
import { dash as s } from "../styles/dash.stylex";
import { ui as u } from "../styles/ui.stylex";
import { cx, label, n, ownerOf, tokenState, when, type Device, type Token } from "./dash-util";

export type CodeFilter = "all" | "unused" | "used" | "canceled";

interface CodeState {
  kind: "count" | "time";
  value: string;
  count: string;
  note: string;
  filter: CodeFilter;
}
/* Remembered across repaints (mint/cancel/delete repaint the whole tab). */
const st: CodeState = { kind: "count", value: "3", count: "1", note: "", filter: "all" };

const FILTERS: Array<[CodeFilter, string]> = [
  ["all", "All"],
  ["unused", "Unused"],
  ["used", "Used"],
  ["canceled", "Canceled"],
];

/** A code's holder line: "for Amina", never "for for Amina" and never the
    old machine-y note the dashboard used to write. */
const holderLabel = (raw: string): string => {
  const t = (raw || "").trim();
  if (!t) return "";
  if (/^for\b/i.test(t)) return t;
  if (/^given from dashboard to\b/i.test(t)) {
    return "for " + t.replace(/^given from dashboard to\s*/i, "");
  }
  return "for " + t;
};

export const visible = (tokens: Token[], f: CodeFilter): Token[] =>
  f === "all" ? tokens : tokens.filter((t) => tokenState(t) === f);

function chipFor(t: Token): string {
  const state = tokenState(t);
  const style = state === "unused" ? s.chipPaid : state === "canceled" ? s.chipBad : s.chipUsed;
  return `<span class="${cx(style)}">${state}</span>`;
}

function tokenRow(t: Token, devices: Device[]): string {
  const state = tokenState(t);
  // Whose code this is, in the owner's words: the redeemer's name/number
  // when we know it, otherwise the note they wrote when giving it out.
  const holder = state === "used" ? ownerOf(t.redeemed_by, devices) : t.note;
  const detail =
    state === "used"
      ? `used ${when(t.redeemed_ms)}${holder ? " by " + holder : ""}`
      : `${state}, made ${when(t.created_ms)}`;
  return `<div class="${cx(u.row)}">
    <div class="${cx(u.rowMain)}">
      <p class="${cx(s.code)}">${esc(t.code)}</p>
      ${holder && state !== "used" ? `<p class="${cx(u.inlineNote)}">${esc(holderLabel(holder))}</p>` : ""}
      <p class="${cx(u.rowSub)}">${esc(label(t.kind, t.value))}<br/>${esc(detail)}</p>
    </div>
    <div class="${cx(u.btnRow)} ${cx(u.btnGrow)}">
      ${chipFor(t)}
      <button class="btn secondary ${cx(u.btnGrow)}" type="button" data-copy="${esc(t.code)}">Copy</button>
      ${state === "unused"
        ? `<button class="btn danger ${cx(u.btnGrow)}" type="button" data-cancel="${esc(t.code)}" title="Stop this code from working">Cancel</button>`
        : `<button class="btn danger ${cx(u.btnGrow)}" type="button" data-del="${esc(t.code)}" title="Remove this code for good">Delete</button>`}
    </div>
  </div>`;
}

/** The three steps + the filtered lists, as HTML. */
export function tokensTab(d: UsageOut, minted: string[]): string {
  const counts: Record<CodeFilter, number> = {
    all: d.tokens.length,
    unused: d.tokens.filter((t) => tokenState(t) === "unused").length,
    used: d.tokens.filter((t) => tokenState(t) === "used").length,
    canceled: d.tokens.filter((t) => tokenState(t) === "canceled").length,
  };
  const rows = visible(d.tokens, st.filter).sort((a, b) => {
    const rank = (t: Token): number => (tokenState(t) === "unused" ? 0 : 1);
    return rank(a) - rank(b) || b.created_ms - a.created_ms;
  });
  const isCount = st.kind === "count";
  const kindWord = isCount ? "try-ons" : "hours";
  return `
  <div class="${cx(u.card)}">
    <div class="${cx(s.stepHead)}"><span class="${cx(s.stepNum)}">1</span>
      <p class="${cx(u.cardTitle)}">Pick what the code gives</p></div>
    <div class="${cx(s.choice)}">
      <button class="${cx(s.choiceBtn, isCount && s.choiceOn)}" type="button" data-kind="count">
        Extra try-ons
        <span class="${cx(s.choiceHint, isCount && s.choiceHintOn)}">${esc(st.value)} more photos to try on, then it stops</span>
      </button>
      <button class="${cx(s.choiceBtn, !isCount && s.choiceOn)}" type="button" data-kind="time">
        Unlimited for hours
        <span class="${cx(s.choiceHint, !isCount && s.choiceHintOn)}">${esc(st.value)} hours of unlimited try-ons</span>
      </button>
    </div>
    <div class="${cx(s.form)}">
      <span class="${cx(s.label)}">How many ${esc(kindWord)}</span>
      <input class="${cx(s.num)}" id="dash-value" type="number" min="1" max="10000" value="${esc(st.value)}" aria-label="how many"/>
      <span class="${cx(s.label)}">Codes to make</span>
      <input class="${cx(s.num)}" id="dash-count" type="number" min="1" max="50" value="${esc(st.count)}" aria-label="how many codes"/>
      <input class="${cx(s.note)}" id="dash-note" placeholder="Note for you (name, amount paid)" value="${esc(st.note)}"/>
    </div>
    <div class="${cx(s.actions)}">
      <button class="btn primary ${cx(u.btnGrow)}" id="dash-mint" type="button">2 · Create ${esc(st.count)} code${st.count === "1" ? "" : "s"}</button>
    </div>
  </div>

  <div class="${cx(u.card)}">
    <div class="${cx(s.stepHead)}"><span class="${cx(s.stepNum)}">2</span>
      <p class="${cx(u.cardTitle)}">Send the new code to the buyer</p></div>
    ${minted.length
      ? `<div class="${cx(s.minted)}">
          <p class="${cx(s.sub)}">Just made - send it on WhatsApp or read it out:</p>
          <div class="${cx(s.mintedCodes)}">${minted.map((c) => `<span class="${cx(s.code)}">${esc(c)}</span>`).join("")}
            <button class="btn secondary" type="button" id="dash-copy-all">Copy all</button>
            <a class="btn secondary" id="dash-wa-code" target="_blank" rel="noopener" href="#">Send on WhatsApp</a>
            <button class="btn secondary" type="button" id="dash-print-new">Print these</button>
          </div>
        </div>`
      : `<p class="${cx(u.rowSub)}">Codes you create show up here, ready to copy or send.</p>`}
  </div>

  <div class="${cx(u.card)}">
    <div class="${cx(s.stepHead)}"><span class="${cx(s.stepNum, s.stepNumOff)}">3</span>
      <p class="${cx(u.cardTitle)}">Keep track and clean up</p></div>
    <p class="${cx(u.rowSub)}"><b>Unused</b> codes still work. <b>Used</b> codes paid for try-ons.
      <b>Canceled</b> codes were pulled by you and no longer work. Delete acts on the list you are
      showing, so filter first.</p>
    <div class="${cx(s.filters)}">
      ${FILTERS.map(([id, name]) =>
        `<button class="${cx(s.filter, st.filter === id && s.filterOn)}" type="button" data-code-filter="${id}">
          ${esc(name)} (${n(counts[id])})</button>`).join("")}
    </div>
    <div class="${cx(s.actions)}">
      ${st.filter === "unused"
        ? `<button class="btn danger ${cx(u.btnGrow)}" type="button" data-cancel-all="1">Cancel all shown (${n(rows.length)})</button>`
        : `<button class="btn danger ${cx(u.btnGrow)}" type="button" data-purge="${st.filter}">
            ${st.filter === "all"
              ? `Delete used + canceled (${n(counts.used + counts.canceled)})`
              : `Delete ${esc(st.filter)} (${n(rows.length)})`}
          </button>`}
      <button class="btn secondary" type="button" id="dash-csv">Export CSV</button>
      <button class="btn secondary" type="button" id="dash-print">Print shown</button>
      <button class="btn secondary" type="button" id="dash-print-paper">Print unused only</button>
    </div>
  </div>

  <div class="${cx(u.cardFlush)}">
    <div class="${cx(u.cardHead)}"><p class="${cx(u.cardTitle)}">Codes (${n(rows.length)})</p>
      <span class="${cx(u.meta)}">${st.filter === "all" ? "everything" : "showing " + esc(st.filter)}</span></div>
    <hr class="${cx(u.hairline)}"/>
    <div class="${cx(u.rows)}">${
      rows.length
        ? rows.map((t, i) => (i ? `<hr class="${cx(u.hairline)}"/>` : "") + tokenRow(t, d.devices)).join("")
        : `<p class="${cx(u.empty)}">No codes in this list yet - create one above.</p>`
    }</div>
  </div>`;
}

/** Wires the codes tab. `after` repaints the dashboard (reload + paint). */
export function armTokens(scope: HTMLElement, opts: {
  token: () => string;
  ownerWa: () => string;
  shop: () => string;
  minted: () => string[];
  after: () => Promise<void>;
  repaint: () => void;
  fail: (m: string) => void;
  note: (m: string) => void;
  csv: (rows: Token[]) => void;
  print: (rows: Token[], title: string) => void;
  data: () => UsageOut | null;
}): void {
  const val = (id: string): string => (scope.querySelector("#" + id) as HTMLInputElement | null)?.value ?? "";
  scope.querySelectorAll("[data-kind]").forEach((b) =>
    b.addEventListener("click", () => {
      st.kind = (b as HTMLElement).dataset.kind === "time" ? "time" : "count";
      if (st.kind === "count" && Number(st.value) > 100) st.value = "3";
      if (st.kind === "time" && Number(st.value) <= 3) st.value = "6";
      opts.repaint();
    }),
  );
  for (const id of ["dash-value", "dash-count", "dash-note"]) {
    scope.querySelector("#" + id)?.addEventListener("input", () => {
      const v = val(id);
      if (id === "dash-value") st.value = v;
      else if (id === "dash-count") st.count = v;
      else st.note = v;
    });
  }
  scope.querySelectorAll("[data-code-filter]").forEach((b) =>
    b.addEventListener("click", () => {
      st.filter = (b as HTMLElement).dataset.codeFilter as CodeFilter;
      opts.repaint();
    }),
  );
  const mintBtn = scope.querySelector("#dash-mint");
  mintBtn?.addEventListener("click", () => void (async () => {
    try {
      const res = await mintTokens(opts.token(), {
        kind: st.kind,
        value: Math.max(1, Number(st.value) || 1),
        count: Math.max(1, Math.min(50, Number(st.count) || 1)),
        note: st.note,
      });
      st.note = "";
      await opts.after();
    } catch (e) {
      opts.fail(e instanceof Error ? e.message : String(e));
    }
  })());
  scope.querySelectorAll("[data-copy]").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      const code = (b as HTMLElement).dataset.copy || "";
      try {
        await navigator.clipboard.writeText(code);
        (b as HTMLElement).textContent = "Copied";
        window.setTimeout(() => { (b as HTMLElement).textContent = "Copy"; }, 1200);
      } catch {
        opts.fail("Copy the code by hand: " + code);
      }
    })()),
  );
  const copyAll = scope.querySelector("#dash-copy-all");
  copyAll?.addEventListener("click", () => void (async () => {
    const codes = opts.minted().join(" ");
    try {
      await navigator.clipboard.writeText(codes);
      copyAll.textContent = "Copied";
      window.setTimeout(() => { copyAll.textContent = "Copy all"; }, 1200);
    } catch {
      opts.fail("Codes: " + codes);
    }
  })());
  // One tap to WhatsApp with the fresh codes already in the message.
  const wa = scope.querySelector("#dash-wa-code") as HTMLAnchorElement | null;
  if (wa) {
    const codes = opts.minted();
    const digits = (opts.ownerWa() || "").replace(/\D/g, "");
    if (codes.length && digits) {
      wa.href = "https://wa.me/" + digits + "?text=" + encodeURIComponent(
        `Hi from ${opts.shop()}! Here is your unlock code: ${codes.join(" ")}. Enter it in the try-on page (Free try-ons, then Details).`,
      );
    } else {
      wa.style.display = "none";
    }
  }
  scope.querySelectorAll("[data-cancel]").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      try {
        await cancelToken(opts.token(), (b as HTMLElement).dataset.cancel || "");
        await opts.after();
      } catch (e) {
        opts.fail(e instanceof Error ? e.message : String(e));
      }
    })()),
  );
  scope.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      try {
        await deleteToken(opts.token(), (b as HTMLElement).dataset.del || "");
        await opts.after();
      } catch (e) {
        opts.fail(e instanceof Error ? e.message : String(e));
      }
    })()),
  );
  scope.querySelectorAll("[data-cancel-all]").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      const d = opts.data();
      const codes = d ? visible(d.tokens, "unused").map((t) => t.code) : [];
      try {
        for (const code of codes) await cancelToken(opts.token(), code);
        await opts.after();
        opts.note(`Canceled ${codes.length} code${codes.length === 1 ? "" : "s"} - they no longer work.`);
      } catch (e) {
        opts.fail(e instanceof Error ? e.message : String(e));
      }
    })()),
  );
  scope.querySelectorAll("[data-purge]").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      const f = (b as HTMLElement).dataset.purge || "used";
      try {
        // "all" only ever removes spent rows: unused codes are never deleted
        // in bulk (they are canceled instead).
        await purgeTokens(opts.token(), f === "all" ? "both" : f === "used" ? "used" : "canceled");
        await opts.after();
      } catch (e) {
        opts.fail(e instanceof Error ? e.message : String(e));
      }
    })()),
  );
  scope.querySelector("#dash-csv")?.addEventListener("click", () => {
    const d = opts.data();
    if (d) opts.csv(visible(d.tokens, st.filter));
  });
  scope.querySelector("#dash-print")?.addEventListener("click", () => {
    const d = opts.data();
    if (d) opts.print(visible(d.tokens, st.filter), "Unlock codes");
  });
  scope.querySelector("#dash-print-paper")?.addEventListener("click", () => {
    const d = opts.data();
    if (d) opts.print(d.tokens.filter((t) => tokenState(t) === "unused"), "Unused unlock codes");
  });
}

export const codeState = st;
export const codeFilter = (): CodeFilter => st.filter;
