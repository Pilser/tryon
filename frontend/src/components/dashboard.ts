/* components/dashboard.ts - owner usage dashboard rendered full-page
   (dashboard.html): overview, devices (users), unlock tokens and settings.
   One `/api/studio/usage` read feeds every tab, so switching tabs is
   instant; token CSV + printable documents are built client-side from the
   same data. Per-device actions: give a token, block / unblock. */
import * as stylex from "@stylexjs/stylex";
import {
  cancelToken,
  deleteToken,
  deviceBlock,
  purgeTokens,
  mintTokens,
  saveSettings,
  studioCredits,
  studioUsage,
  type UsageOut,
} from "../core/api";
import { loadOwner } from "../core/store";
import { esc } from "../core/format";
import { skin } from "../skin";
import { dash as s } from "../styles/dash.stylex";
import { studio } from "../styles/panels.stylex";

const cx = (...ss: any[]): string =>
  ss.filter(Boolean).map((x) => (typeof x === "string" ? x : stylex.props(x).className || "")).join(" ");

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
/** Host the dashboard paints into (dashboard.html owns the page frame). */
let host: HTMLElement | null = null;

const el = (id: string): HTMLElement | null => document.getElementById(id);
const n = (v: number): string => String(v ?? 0);
const when = (ms: number): string => (ms > 0 ? new Date(ms).toLocaleString() : "-");
const short = (v: string): string => (v.length > 10 ? v.slice(0, 8) + "…" : v || "-");

const label = (kind: string, value: number): string =>
  kind === "time" ? `${value} h unlimited` : `${value} try-on${value === 1 ? "" : "s"}`;

/* ------------------------------------------------------- pure helpers --- */

/** CSV of every token: what the owner keeps after printing the paper ones. */
export function tokensCsv(rows: UsageOut["tokens"]): string {
  const head = "code,kind,value,note,created,status,redeemed_by,redeemed_at";
  const line = (r: UsageOut["tokens"][number]): string =>
    [
      r.code,
      r.kind,
      String(r.value),
      csvCell(r.note),
      new Date(r.created_ms).toISOString(),
      r.redeemed_by ? "used" : r.canceled ? "canceled" : "unused",
      r.redeemed_by || "",
      r.redeemed_ms ? new Date(r.redeemed_ms).toISOString() : "",
    ].join(",");
  return [head, ...rows.map(line)].join("\n");
}

const csvCell = (v: string): string =>
  /[",\n]/.test(v || "") ? `"${(v || "").replace(/"/g, '""')}"` : v || "";

/** Printable document the owner hands to the buyer (one block per code). */
export function tokensDoc(title: string, rows: UsageOut["tokens"], shop: string): string {
  const cards = rows
    .map(
      (r) => `<section class="card">
      <p class="shop">${esc(shop)}</p>
      <p class="code">${esc(r.code)}</p>
      <p class="what">${esc(label(r.kind, r.value))}</p>
      <p class="meta">${r.redeemed_by ? "Used " + esc(when(r.redeemed_ms)) : "Unused"}${
        r.note ? " · " + esc(r.note) : ""
      }</p>
      <p class="hint">Enter this code in the studio banner (Free try-ons → Details → Unlock try-ons). One use only.</p>
    </section>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(title)}</title><style>
    body{font-family:Inter,system-ui,sans-serif;background:#fff;color:#111;margin:24px}
    h1{font-size:20px;margin:0 0 4px}
    .sub{color:#555;font-size:12px;margin:0 0 18px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
    .card{border:1px dashed #333;border-radius:12px;padding:14px}
    .shop{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#555;margin:0 0 6px}
    .code{font-family:ui-monospace,Menlo,monospace;font-size:30px;font-weight:800;letter-spacing:.16em;margin:0 0 6px}
    .what{font-size:14px;font-weight:700;margin:0 0 8px}
    .meta{font-size:11px;color:#555;margin:0 0 6px}
    .hint{font-size:10px;color:#777;margin:0}
    @media print{.grid{gap:10px}}
  </style></head><body><h1>${esc(title)}</h1>
  <p class="sub">${rows.length} code${rows.length === 1 ? "" : "s"} · printed ${esc(new Date().toLocaleString())}</p>
  <div class="grid">${cards}</div></body></html>`;
}

/* ------------------------------------------------------------ actions --- */

const ownerToken = (): string => loadOwner();

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
    paintError(e instanceof Error ? e.message : String(e));
  }
}

function paintError(msg: string): void {
  if (host) host.innerHTML = `<p class="${cx(s.empty)}">${esc(msg)}</p>`;
}

function download(name: string, text: string, mime: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
}

/* ------------------------------------------------------------- render --- */

function tile(value: string, name: string): string {
  return `<div class="${cx(s.tile)}"><p class="${cx(s.tileN)}">${esc(value)}</p><p class="${cx(s.tileL)}">${esc(name)}</p></div>`;
}

function deviceRow(d: UsageOut["devices"][number], free: number): string {
  const window_ = d.bonus_until_ms > Date.now();
  const spent = d.used >= free && !window_ && d.bonus <= 0;
  const blocked = !!d.blocked;
  const who = d.name || d.whatsapp || "Guest " + short(d.id);
  const chips = [
    `<span class="${cx(s.chip, spent ? s.chipUsed : s.chipFree)}">${n(d.used)} tries</span>`,
    d.bonus > 0 ? `<span class="${cx(s.chip, s.chipPaid)}">+${n(d.bonus)} paid</span>` : "",
    window_ ? `<span class="${cx(s.chip, s.chipPaid)}">unlimited</span>` : "",
  ].join("");
  const wa = d.whatsapp
    ? `<a class="${cx(s.chip)}" href="https://wa.me/${esc(d.whatsapp)}" target="_blank" rel="noopener">+${esc(d.whatsapp)}</a>`
    : `<span class="${cx(s.chipUsed)}">no number yet</span>`;
  const guard = blocked ? `<span class="${cx(s.chip, s.chipUsed)}">blocked</span>` : "";
  return `<div class="${cx(s.row)}">
    <div><p class="${cx(s.who)}">${esc(who)}</p>
    <p class="${cx(s.sub)}">seen ${esc(when(d.last_seen_ms))} · device ${esc(short(d.id))}</p></div>
    <div class="${cx(s.chips)}">${guard}${chips}${wa}</div>
    <div class="${cx(s.actions)}">
      <button class="btn secondary" type="button" data-give="${esc(d.id)}" title="Mint one code for this user">Give token</button>
      <button class="btn" type="button" data-block="${esc(d.id)}" data-on="${blocked ? "1" : "0"}">${blocked ? "Unblock" : "Block"}</button>
    </div>
  </div>`;
}

function tokenRow(t: UsageOut["tokens"][number]): string {
  const used = !!t.redeemed_by;
  const canceled = !used && !!t.canceled;
  const state = used ? "used" : canceled ? "canceled" : "unused";
  return `<div class="${cx(s.row)}">
    <div><p class="${cx(s.code)}">${esc(t.code)}</p>
    <p class="${cx(s.sub)}">${esc(label(t.kind, t.value))}${t.note ? " · " + esc(t.note) : ""}<br/>${
      used
        ? "used " + esc(when(t.redeemed_ms)) + " by " + esc(short(t.redeemed_by))
        : canceled
          ? "canceled, made " + esc(when(t.created_ms))
          : "unused, made " + esc(when(t.created_ms))
    }</p></div>
    <div class="${cx(s.chips)}">
      <span class="${cx(s.chip, state === "unused" ? s.chipPaid : s.chipUsed)}">${state}</span>
      <button class="btn secondary" type="button" data-copy="${esc(t.code)}">Copy</button>
      ${state === "unused" ? `<button class="btn" type="button" data-cancel="${esc(t.code)}">Cancel</button>` : ""}
      ${used || canceled ? `<button class="btn" type="button" data-del="${esc(t.code)}">Delete</button>` : ""}
    </div>
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

  let body = "";
  if (active === "overview") {
    body = `<div class="${cx(s.tiles)}">
        ${tile(n(d.devices_total), "users")}
        ${tile(n(d.tryons_total), "try-ons")}
        ${tile(n(d.tokens_redeemed), "codes used")}
        ${tile(n(Math.max(0, d.tokens_total - d.tokens_redeemed)), "codes unused")}
        ${tile(credits === null ? "-" : n(credits), "credits")}
      </div>
      <p class="${cx(s.sectionTitle)}">Latest users</p>
      <div class="${cx(s.list)}">${
        d.devices.slice(0, 6).map((x) => deviceRow(x, d.free_tries)).join("") ||
        `<p class="${cx(s.empty)}">No try-ons yet.</p>`
      }</div>`;
  } else if (active === "users") {
    body = `<div class="${cx(s.tiles)}">
        ${tile(n(d.devices_total), "users")}
        ${tile(n(d.free_tries), "free each")}
        ${tile(n(d.tryons_total), "try-ons")}
      </div>
      <p class="${cx(s.sectionTitle)}">Give a token to one user</p>
      <p class="${cx(s.sub)}">Pick the value, tap Give token on their row, then send the code to their
        WhatsApp. The code is one-use: they type it in the studio banner and it lands on their device.</p>
      <div class="${cx(s.form)}">
        <input class="${cx(s.num)}" id="dash-give-val" type="number" min="1" max="10000" value="3" aria-label="try-ons per given token"/>
        <span class="${cx(s.sub)}">try-ons per code</span>
      </div>
      <p class="${cx(s.sub)}" id="dash-given" style="display:none"></p>
      <div class="${cx(s.list)}">${
        d.devices.map((x) => deviceRow(x, d.free_tries)).join("") ||
        `<p class="${cx(s.empty)}">No devices yet.</p>`
      }</div>
      <p class="${cx(s.sectionTitle)}">Blocked devices</p>
      <p class="${cx(s.sub)}">Blocked = try-ons pause on that device until you tap Unblock. Give a token
        or unblock after you have talked to the user on WhatsApp.</p>`;
  } else if (active === "tokens") {
    const unused = d.tokens.filter((x) => !x.redeemed_by && !x.canceled);
    const used = d.tokens.filter((x) => !!x.redeemed_by);
    const canceled = d.tokens.filter((x) => !x.redeemed_by && !!x.canceled);
    const spent = d.tokens.filter((x) => !!x.redeemed_by || !!x.canceled);
    body = `<p class="${cx(s.sectionTitle)}">Make codes</p>
      <div class="${cx(s.form)}">
        <select class="${cx(studio.select)}" id="dash-kind">
          <option value="count">Try-ons (count)</option>
          <option value="time">Unlimited (hours)</option>
        </select>
        <input class="${cx(s.num)}" id="dash-value" type="number" min="1" max="10000" value="3" aria-label="how many"/>
        <input class="${cx(s.num)}" id="dash-count" type="number" min="1" max="50" value="1" aria-label="how many codes"/>
        <input class="${cx(s.note)}" id="dash-note" placeholder="Note (name, amount paid)"/>
        <button class="btn primary" id="dash-mint" type="button">Generate</button>
      </div>
      ${minted.length ? `<div class="${cx(s.minted)}"><p class="${cx(s.sub)}">Just made - copy and send:</p>
        <div class="${cx(s.mintedCodes)}">${minted.map((c) => `<span class="${cx(s.code)}">${esc(c)}</span>`).join("")}
        <button class="btn secondary" type="button" id="dash-copy-all">Copy all</button>
        <button class="btn secondary" type="button" id="dash-print-new">Print these</button></div></div>` : ""}
      <div class="${cx(s.actions)}">
        <button class="btn secondary" type="button" id="dash-csv">Export CSV</button>
        <button class="btn secondary" type="button" id="dash-print">Print all codes</button>
        <button class="btn secondary" type="button" id="dash-print-paper">Print unused only</button>
      </div>
      <p class="${cx(s.sectionTitle)}">Unused (${n(unused.length)})</p>
      <div class="${cx(s.list)}">${
        unused.map(tokenRow).join("") || `<p class="${cx(s.empty)}">No unused codes.</p>`
      }</div>
      <p class="${cx(s.sectionTitle)}">Used &amp; canceled (${n(spent.length)}) - safe to delete</p>
      <div class="${cx(s.actions)}">
        <button class="btn secondary" type="button" data-purge="used">Delete used (${n(used.length)})</button>
        <button class="btn secondary" type="button" data-purge="canceled">Delete canceled (${n(canceled.length)})</button>
        <button class="btn primary" type="button" data-purge="both">Delete both (${n(spent.length)})</button>
      </div>
      <div class="${cx(s.list)}">${
        spent.map(tokenRow).join("") || `<p class="${cx(s.empty)}">No used or canceled codes.</p>`
      }</div>`;
  } else {
    body = `<p class="${cx(s.body)}">Every device gets <b>${n(d.free_tries)}</b> free try-ons before the
      unlock banner asks for a WhatsApp number. Change it here; devices already over the new number
      simply stay blocked, nobody is charged retroactively.</p>
      <div class="${cx(s.form)}">
        <input class="${cx(s.num)}" id="dash-free" type="number" min="0" max="1000" value="${n(d.free_tries)}" aria-label="free try-ons"/>
        <button class="btn primary" id="dash-save" type="button">Save allowance</button>
      </div>
      <p class="${cx(s.sectionTitle)}">Credits</p>
      <p class="${cx(s.body)}">Balance: <b>${credits === null ? "not available" : n(credits)}</b> (each try-on costs 1,
        failed ones are refunded).</p>
      <p class="${cx(s.sectionTitle)}">Shop contact used by the banner</p>
      <p class="${cx(s.sub)}">WhatsApp: <b>${d.owner_whatsapp ? "+" + esc(d.owner_whatsapp) : "not set"}</b>
        - edit it in the Shop card above (name, number, currency).</p>
      <p class="${cx(s.sectionTitle)}">How tracking works</p>
      <p class="${cx(s.sub)}">Each browser keeps a device id (restored from a browser fingerprint if the
        storage is cleared, which is why the same phone keeps the same row). The WhatsApp number a shopper
        gives is the durable identity: if they change phone, the number is what you look up here.</p>`;
  }

  box.innerHTML = `<div class="${cx(s.tabs)}">${tabs}</div><div class="${cx(s.panel)}">${body}</div>`;
  skin(box);
  wire();
}

function wire(): void {
  host?.querySelectorAll("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      active = (b as HTMLElement).dataset.tab as Tab;
      paint();
    }),
  );
  host?.querySelectorAll("[data-copy]").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      const code = (b as HTMLElement).dataset.copy || "";
      try {
        await navigator.clipboard.writeText(code);
        (b as HTMLButtonElement).textContent = "Copied";
      } catch {
        (b as HTMLButtonElement).textContent = code;
      }
    })()),
  );
  host?.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      try {
        await deleteToken(ownerToken(), (b as HTMLElement).dataset.del || "");
        await reload();
      } catch (e) {
        paintError(e instanceof Error ? e.message : String(e));
      }
    })()),
  );
  host?.querySelectorAll("[data-cancel]").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      try {
        await cancelToken(ownerToken(), (b as HTMLElement).dataset.cancel || "");
        await reload();
      } catch (e) {
        paintError(e instanceof Error ? e.message : String(e));
      }
    })()),
  );
  host?.querySelectorAll("[data-purge]").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      const filter = (b as HTMLElement).dataset.purge as "used" | "canceled" | "both";
      try {
        await purgeTokens(ownerToken(), filter);
        await reload();
      } catch (e) {
        paintError(e instanceof Error ? e.message : String(e));
      }
    })()),
  );
  host?.querySelectorAll("[data-block]").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      const btn = b as HTMLElement;
      try {
        await deviceBlock(ownerToken(), btn.dataset.block || "", btn.dataset.on !== "1");
        await reload();
      } catch (e) {
        paintError(e instanceof Error ? e.message : String(e));
      }
    })()),
  );
  host?.querySelectorAll("[data-give]").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      const btn = b as HTMLElement;
      const id = btn.dataset.give || "";
      const value = Number((el("dash-give-val") as HTMLInputElement | null)?.value || 3);
      const target = data?.devices.find((x) => x.id === id);
      const note = target ? `given to ${target.name || target.whatsapp || id}` : "given from dashboard";
      try {
        const res = await mintTokens(ownerToken(), { kind: "count", value, count: 1, note });
        minted = res.codes;
        await reload();
        // The given code is the whole point: surface it right here.
        const said = el("dash-given");
        if (said) {
          said.innerHTML = `Code for ${esc(short(id))}: <span class="${cx(s.code)}">${esc(res.codes.join(", "))}</span>`;
          said.style.display = "";
        }
      } catch (e) {
        paintError(e instanceof Error ? e.message : String(e));
      }
    })()),
  );
  el("dash-mint")?.addEventListener("click", () => void (async () => {
    try {
      const kind = (el("dash-kind") as HTMLSelectElement).value;
      const value = Number((el("dash-value") as HTMLInputElement).value || 1);
      const count = Number((el("dash-count") as HTMLInputElement).value || 1);
      const note = (el("dash-note") as HTMLInputElement).value || "";
      const res = await mintTokens(ownerToken(), { kind, value, count, note });
      minted = res.codes;
      await reload();
    } catch (e) {
      paintError(e instanceof Error ? e.message : String(e));
    }
  })());
  el("dash-copy-all")?.addEventListener("click", () => void (async () => {
    try {
      await navigator.clipboard.writeText(minted.join(" "));
    } catch {
      /* clipboard blocked: the codes are on screen anyway */
    }
  })());
  el("dash-save")?.addEventListener("click", () => void (async () => {
    try {
      const free = Number((el("dash-free") as HTMLInputElement).value || 0);
      await saveSettings(ownerToken(), free);
      await reload();
    } catch (e) {
      paintError(e instanceof Error ? e.message : String(e));
    }
  })());
  const shop = (document.querySelector(".brand")?.textContent || "TryOn & Shop").trim();
  const openDoc = (rows: UsageOut["tokens"], title: string): void => {
    const html = tokensDoc(title, rows, shop);
    const w = window.open("", "_blank");
    if (!w) {
      download("tryon-codes.html", html, "text/html");
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };
  el("dash-csv")?.addEventListener("click", () =>
    data && download("tryon-codes.csv", tokensCsv(data.tokens), "text/csv"));
  el("dash-print")?.addEventListener("click", () => data && openDoc(data.tokens, "Unlock codes"));
  el("dash-print-new")?.addEventListener("click", () =>
    data && openDoc(data.tokens.filter((t) => minted.includes(t.code)), "New unlock codes"));
  el("dash-print-paper")?.addEventListener("click", () =>
    data && openDoc(data.tokens.filter((t) => !t.redeemed_by), "Unused unlock codes"));
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
