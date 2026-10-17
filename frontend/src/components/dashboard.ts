/* components/dashboard.ts - owner usage dashboard, rendered full-page in
   dashboard.html. Four tabs; one `/api/studio/usage` read feeds them all,
   so switching tabs is instant. Numbers on the Overview are buttons: each
   one lands on the tab that explains it. Heavy tab bodies live next door
   (dash-tokens.ts, dash-users.ts) - this file owns state, chrome and the
   owner-only actions that are not tab specific. */
import {
  saveSettings,
  studioCredits,
  studioUsage,
  type UsageOut,
} from "../core/api";
import { esc, size } from "../core/format";
import { loadOwner } from "../core/store";
import { skin } from "../skin";
import { dash as s } from "../styles/dash.stylex";
import { armTokens, tokensTab } from "./dash-tokens";
import { armUsers, closeFolder, usersTab } from "./dash-users";
import { cx, n, short, tokenState, tokensCsv, tokensDoc, when, type Token } from "./dash-util";

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

/** One stat tile. With `go` it is a button that lands on that tab. */
function tile(value: string, name: string, go?: Tab, hint?: string): string {
  const inner = `<p class="${cx(s.tileN)}">${esc(value)}</p><p class="${cx(s.tileL)}">${esc(name)}</p>${
    go ? `<span class="${cx(s.tileFoot)}">${esc(hint || "Open")} <span aria-hidden="true">›</span></span>` : ""
  }`;
  return go
    ? `<button class="${cx(s.tile, s.tileGo)}" type="button" data-go="${go}">${inner}</button>`
    : `<div class="${cx(s.tile)}">${inner}</div>`;
}

function overviewTab(d: UsageOut): string {
  const unused = d.tokens.filter((t) => tokenState(t) === "unused").length;
  const used = d.tokens.filter((t) => tokenState(t) === "used").length;
  return `<div class="${cx(s.tiles)}">
      ${tile(n(d.devices_total), "users", "users", "See who")}
      ${tile(n(d.tryons_total), "try-ons", "users", "See who")}
      ${tile(n(used), "codes used", "tokens", "See codes")}
      ${tile(n(unused), "codes ready", "tokens", "See codes")}
      ${tile(n(d.photos_total), "photos stored", "users", "Review")}
      ${tile(size(d.photos_bytes), "storage used", "users", "Clean up")}
      ${tile(credits === null ? "-" : n(credits), "credits", "settings", "Balance")}
    </div>
    <p class="${cx(s.sectionTitle)}">Latest users</p>
    <div class="${cx(s.list)}">${
      d.devices.slice(0, 6).map((x) => deviceSummary(x, d.free_tries)).join("") ||
      `<p class="${cx(s.empty)}">No try-ons yet.</p>`
    }</div>`;
}

/** Read-only row for the Overview (actions live in the Users tab). */
function deviceSummary(d: UsageOut["devices"][number], free: number): string {
  const window_ = d.bonus_until_ms > Date.now();
  const spent = d.used >= free && !window_ && d.bonus <= 0;
  const who = d.name || d.whatsapp || "Guest " + short(d.id);
  return `<div class="${cx(s.row)}">
    <div><p class="${cx(s.who)}">${esc(who)}</p>
    <p class="${cx(s.sub)}">${esc(when(d.last_seen_ms))}</p></div>
    <div class="${cx(s.chips)}">
      <span class="${cx(spent ? s.chipUsed : s.chipFree)}">${n(d.used)} tries</span>
      ${d.blocked ? `<span class="${cx(s.chipBad)}">blocked</span>` : ""}
      ${d.photo_count ? `<span class="${cx(s.chipFree)}">${esc(size(d.photo_bytes))}</span>` : ""}
    </div>
  </div>`;
}

function settingsTab(d: UsageOut): string {
  return `<div class="${cx(s.step)}">
      <p class="${cx(s.stepTitle)}">Free try-ons per device</p>
      <p class="${cx(s.body)}">Every new device gets <b>${n(d.free_tries)}</b> free try-ons before the unlock
        banner asks for a WhatsApp number. Devices already past the new number keep their limit - nobody is
        charged retroactively.</p>
      <div class="${cx(s.form)}">
        <input class="${cx(s.num)}" id="dash-free" type="number" min="0" max="1000" value="${n(d.free_tries)}" aria-label="free try-ons"/>
        <button class="btn primary" id="dash-save" type="button">Save allowance</button>
      </div>
    </div>
    <div class="${cx(s.step)}">
      <p class="${cx(s.stepTitle)}">Try-on credits</p>
      <p class="${cx(s.body)}">Balance: <b>${credits === null ? "not available" : n(credits)}</b>. Each try-on
        costs 1 credit and failed ones are refunded, so this number only moves down when a shopper really
        gets a photo.</p>
    </div>
    <div class="${cx(s.step)}">
      <p class="${cx(s.stepTitle)}">Shop details</p>
      <p class="${cx(s.body)}">Shop name, WhatsApp number, logo and catalog live in the
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
      if (active !== "users") closeFolder(opts());
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
      shop: () => (document.querySelector(".brand")?.textContent || "the shop").trim(),
    });
    // Remember the chosen "code value" so repaints keep it.
    box.querySelector("#dash-give-val")?.addEventListener("input", (ev) => {
      giveValue = (ev.target as HTMLInputElement).value;
    });
  }
}

const opts = (): Parameters<typeof armUsers>[0] => ({
  scope: () => host as HTMLElement,
  token: ownerToken,
  repaint: paint,
  after: refresh,
  fail,
  note,
  shop: () => "the shop",
});

/**
 * Full-page dashboard: the page owns the frame (login card + container);
 * this loads the data and paints the tabs. Owner token required.
 */
export async function renderDashboard(box: HTMLElement): Promise<void> {
  host = box;
  if (!data) await reload();
  else paint();
}
