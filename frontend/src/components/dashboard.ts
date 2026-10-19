/* components/dashboard.ts - owner usage dashboard, rendered full-page in
   dashboard.html. Four tabs; one `/api/studio/usage` read feeds them all,
   so switching tabs is instant. Numbers on the Overview are buttons: each
   one lands on the tab that explains it. Heavy tab bodies live next door
   (dash-tokens.ts, dash-users.ts) - this file owns state, chrome and the
   owner-only actions that are not tab specific. */
import {
  redeemPlatformToken,
  requestPlatformCredits,
  saveSettings,
  studioCredits,
  studioUsage,
  type UsageOut,
} from "../core/api";
import { esc, size } from "../core/format";
import { loadOwner } from "../core/store";
import { skin } from "../skin";
import { dash as s } from "../styles/dash.stylex";
import { ui as u } from "../styles/ui.stylex";
import { armTokens, tokensTab } from "./dash-tokens";
import { armUsers, resetFolder, usersTab } from "./dash-users";
import { cx, n, tokenState, tokensCsv, tokensDoc, when, who, type Token } from "./dash-util";

type Tab = "overview" | "users" | "tokens" | "settings";
const TABS: Array<[Tab, string]> = [
  ["overview", "Overview"],
  ["users", "Users"],
  ["tokens", "Unlock codes"],
  ["settings", "Settings"],
];

let active: Tab = "overview";
let data: UsageOut | null = null;
let minted: string[] = [];
let credits: number | null = null;
let giveValue = "3";
let flash = "";
/** Host the dashboard paints into (dashboard.html owns the page frame). */
let host: HTMLElement | null = null;

const ownerToken = (): string => loadOwner();
const el = (id: string): HTMLElement | null => document.getElementById(id);

function note(msg: string): void {
  flash = msg;
  paint();
  window.setTimeout(() => {
    if (flash === msg) {
      flash = "";
      paint();
    }
  }, 6000);
}

function fail(msg: string): void {
  note("Could not do that: " + msg);
}

async function reload(): Promise<void> {
  try {
    data = await studioUsage(ownerToken());
    paint();
    // Balance is nice-to-have: a missing key or a provider hiccup must not
    // blank the dashboard, so it lands after the main paint.
    try {
      credits = (await studioCredits(ownerToken())).creditBalance;
      paint();
    } catch {
      credits = null;
    }
  } catch (e) {
    const box = host;
    if (box) box.innerHTML = `<p class="${cx(s.empty)}">${esc(e instanceof Error ? e.message : String(e))}</p>`;
  }
}

const refresh = async (): Promise<void> => {
  await reload();
};

/* ------------------------------------------------------------- render --- */

/** One stat card: muted label on top, big value, hairline rule (the kit's
    chart placeholder). With `go` it is a button that lands on that tab. */
function tile(value: string, name: string, go?: Tab, hint?: string): string {
  const inner = `<p class="${cx(u.statLabel)}">${esc(name)}</p>
    <p class="${cx(u.statValue)}">${esc(value)}</p>
    <hr class="${cx(u.statRule)}"/>${
      go ? `<span class="${cx(u.statFoot)}">${esc(hint || "Open")} <span aria-hidden="true">›</span></span>` : ""
    }`;
  return go
    ? `<button class="${cx(u.stat, u.statGo)}" type="button" data-go="${go}">${inner}</button>`
    : `<div class="${cx(u.stat)}">${inner}</div>`;
}

function overviewTab(d: UsageOut): string {
  const unused = d.tokens.filter((t) => tokenState(t) === "unused").length;
  const used = d.tokens.filter((t) => tokenState(t) === "used").length;
  return `<div class="${cx(u.statGrid)}">
      ${tile(n(d.devices_total), "users", "users", "See who")}
      ${tile(n(d.tryons_total), "try-ons", "users", "See who")}
      ${tile(n(used), "codes used", "tokens", "See codes")}
      ${tile(n(unused), "codes ready", "tokens", "See codes")}
      ${tile(n(d.photos_total), "photos stored", "users", "Review")}
      ${tile(size(d.photos_bytes), "storage used", "users", "Clean up")}
      ${tile(credits === null ? "-" : n(credits), "credits", "settings", "Balance")}
    </div>
    <div class="${cx(u.cardFlush)}">
      <div class="${cx(u.cardHead)}"><p class="${cx(u.cardTitle)}">Latest users</p>
        <button class="btn secondary" type="button" data-go="users">See all ${n(d.devices_total)}</button></div>
      <hr class="${cx(u.hairline)}"/>
      <div class="${cx(u.rows)}">${
        d.devices.length
          ? d.devices.slice(0, 5)
              .map((x, i) => (i ? `<hr class="${cx(u.hairline)}"/>` : "") + deviceSummary(x, d.free_tries))
              .join("")
          : `<p class="${cx(u.empty)}">No try-ons yet - a device shows up here the first time someone opens the studio.</p>`
      }</div>
    </div>`;
}

/** Read-only row for the Overview (actions live in the Users tab). */
function deviceSummary(d: UsageOut["devices"][number], free: number): string {
  const window_ = d.bonus_until_ms > Date.now();
  const spent = d.used >= free && !window_ && d.bonus <= 0;
  return `<div class="${cx(u.row)}">
    <div class="${cx(u.rowMain)}">
      <p class="${cx(u.rowTitle)}">${esc(who(d.id, d.name, d.whatsapp))}</p>
      <p class="${cx(u.rowSub)}">last seen ${esc(when(d.last_seen_ms))}</p>
    </div>
    <div class="${cx(s.chips)}">
      <span class="${cx(spent ? s.chipUsed : s.chipFree)}">${n(d.used)} tries</span>
      ${d.blocked ? `<span class="${cx(s.chipBad)}">blocked</span>` : ""}
      ${d.photo_count ? `<span class="${cx(s.chipFree)}">${esc(size(d.photo_bytes))}</span>` : ""}
    </div>
  </div>`;
}

function settingsTab(d: UsageOut): string {
  return `<div class="${cx(u.card)}">
      <p class="${cx(u.cardTitle)}">Free try-ons per device</p>
      <p class="${cx(s.body)}">Every new device gets <b>${n(d.free_tries)}</b> free try-ons before the unlock
        banner asks for a WhatsApp number. Devices already past the new number keep their limit - nobody is
        charged retroactively.</p>
      <div class="${cx(s.form)}">
        <input class="${cx(s.num)}" id="dash-free" type="number" min="0" max="1000" value="${n(d.free_tries)}" aria-label="free try-ons"/>
        <button class="btn primary" id="dash-save" type="button">Save allowance</button>
      </div>
    </div>
    <div class="${cx(u.card)}">
      <p class="${cx(u.cardTitle)}">Try-on credits</p>
      <p class="${cx(s.body)}">Balance: <b>${credits === null ? "not available" : n(credits)}</b>. Each try-on
        costs 1 credit and failed ones are refunded, so this number only moves down when a shopper really
        gets a photo.</p>
    </div>
    <div class="${cx(u.card)}">
      <p class="${cx(u.cardTitle)}">Platform tokens</p>
      <p class="${cx(s.body)}">Running on the SaaSTryon platform? The platform admin hands you
        4-digit codes - fill one in here and its try-on credits land on this shop's balance.</p>
      <div class="${cx(s.form)}">
        <input class="${cx(s.num)}" id="dash-redeem" inputmode="numeric" maxlength="4"
          placeholder="e.g. 0421" aria-label="platform token code"/>
        <button class="btn primary" id="dash-redeem-btn" type="button">Redeem code</button>
      </div>
      <p class="${cx(s.body)}">Out of codes? Ask the platform admin for more - the request
        shows up in their console for approval.</p>
      <div class="${cx(s.form)}">
        <input class="${cx(s.num)}" id="dash-request" type="number" min="1" max="10000"
          placeholder="e.g. 50" aria-label="credits to request"/>
        <button class="btn secondary" id="dash-request-btn" type="button">Request credits</button>
      </div>
    </div>
    <div class="${cx(u.card)}">
      <p class="${cx(u.cardTitle)}">Shop details</p>
      <p class="${cx(u.rowSub)}">Shop name, WhatsApp number, logo and catalog live in the
        <a class="btn secondary" href="/app/studio.html?owner=1">Studio</a>.</p>
    </div>`;
}

function paint(): void {
  if (!host || !data) return;
  const box = host;
  const d = data;
  const tabs = TABS.map(
    ([id, name]) =>
      `<button class="${cx(s.tab, active === id && s.tabOn)}" type="button" data-tab="${id}">${esc(name)}${
        id === "tokens" ? ` (${n(d.tokens_total)})` : id === "users" ? ` (${n(d.devices_total)})` : ""
      }</button>`,
  ).join("");
  const body =
    active === "overview"
      ? overviewTab(d)
      : active === "users"
        ? usersTab(d, giveValue)
        : active === "tokens"
          ? tokensTab(d, minted)
          : settingsTab(d);
  box.innerHTML =
    `<div class="${cx(s.tabs)}">${tabs}</div>` +
    (flash ? `<p class="${cx(s.chipFree)}" style="margin-top:10px">${esc(flash)}</p>` : "") +
    `<div class="${cx(s.panel)}">${body}</div>`;
  skin(box);
  wire(box);
}

/* --------------------------------------------------------- behaviour --- */

function download(name: string, text: string, mime: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
}

function openDoc(rows: Token[], title: string): void {
  const shop = (document.querySelector(".brand")?.textContent || "Try-on shop").trim();
  const html = tokensDoc(title, rows, shop);
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  window.setTimeout(() => w.print(), 300);
}

function wire(box: HTMLElement): void {
  box.querySelectorAll("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      active = (b as HTMLElement).dataset.tab as Tab;
      if (active !== "users") resetFolder();
      paint();
    }),
  );
  box.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => {
      active = (b as HTMLElement).dataset.go as Tab;
      paint();
    }),
  );
  box.querySelector("#dash-save")?.addEventListener("click", () => void (async () => {
    const v = Number((el("dash-free") as HTMLInputElement | null)?.value || 0);
    try {
      await saveSettings(ownerToken(), v);
      note("Allowance saved: " + n(v) + " free try-ons per device.");
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
  })());
  box.querySelector("#dash-redeem-btn")?.addEventListener("click", () => void (async () => {
    const v = (el("dash-redeem") as HTMLInputElement | null)?.value.trim() || "";
    if (!v) { fail("Fill in the 4-digit code first."); return; }
    try {
      const out = await redeemPlatformToken(ownerToken(), v);
      note(out.message || "Code redeemed.");
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
  })());
  box.querySelector("#dash-request-btn")?.addEventListener("click", () => void (async () => {
    const raw = (el("dash-request") as HTMLInputElement | null)?.value.trim() || "";
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 1 || amount > 10000) {
      fail("Request between 1 and 10000 credits.");
      return;
    }
    try {
      const out = await requestPlatformCredits(ownerToken(), Math.floor(amount));
      note(out.message || "Request sent.");
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
  })());
  if (active === "tokens") {
    armTokens(box, {
      token: ownerToken,
      ownerWa: () => data?.owner_whatsapp || "",
      shop: () => (document.querySelector(".brand")?.textContent || "the shop").trim(),
      minted: () => minted,
      after: refresh,
      repaint: paint,
      fail,
      note,
      csv: (rows) => download("tryon-codes.csv", tokensCsv(rows), "text/csv"),
      print: openDoc,
      data: () => data,
    });
  }
  if (active === "users") {
    armUsers({
      scope: () => box,
      token: ownerToken,
      repaint: paint,
      after: refresh,
      fail,
      note,
    });
    // Remember the chosen "code value" so repaints keep it.
    box.querySelector("#dash-give-val")?.addEventListener("input", (ev) => {
      giveValue = (ev.target as HTMLInputElement).value;
    });
  }
}

/**
 * Full-page dashboard: the page owns the frame (login card + container);
 * this loads the data and paints the tabs. Owner token required.
 */
export async function renderDashboard(box: HTMLElement): Promise<void> {
  host = box;
  if (!data) await reload();
  else paint();
}
