/* components/dash-util.ts - shared dashboard helpers: literal-class fusion
   (StyleX needs stylex.props) plus the pure formatting and export builders
   every tab reuses. No DOM, no network. */
import * as stylex from "@stylexjs/stylex";
import type { UsageOut } from "../core/api";
import { esc } from "../core/format";

export type Token = UsageOut["tokens"][number];
export type Device = UsageOut["devices"][number];

export const cx = (...ss: any[]): string =>
  ss.filter(Boolean).map((x) => (typeof x === "string" ? x : stylex.props(x).className || "")).join(" ");

export const n = (v: number): string => String(v ?? 0);
export const when = (ms: number): string => (ms > 0 ? new Date(ms).toLocaleString() : "-");
export const short = (v: string): string => (v.length > 10 ? v.slice(0, 8) + "…" : v || "-");

/** Who a device is, in the owner's words: the name or number they gave,
    falling back to the short device id for a guest who never signed in. */
export const who = (id: string, name = "", whatsapp = ""): string =>
  (name || "").trim() || (whatsapp ? "+" + whatsapp.replace(/^\+/, "") : "") || "Guest " + short(id);

/** Device lookup for a redeemed code: "Amina" / "+2567…" / the device id. */
export const ownerOf = (deviceId: string, devices: Device[]): string => {
  if (!deviceId) return "";
  const d = devices.find((x) => x.id === deviceId);
  return d ? who(d.id, d.name, d.whatsapp) : short(deviceId);
};

/** What a code gives, in plain words. */
export const label = (kind: string, value: number): string =>
  kind === "time" ? `${value} h unlimited` : `${value} try-on${value === 1 ? "" : "s"}`;

/** One word state per code: unused / used / canceled. */
export const tokenState = (t: Token): "used" | "canceled" | "unused" =>
  t.redeemed_by ? "used" : t.canceled ? "canceled" : "unused";

const csvCell = (v: string): string =>
  /[",\n]/.test(v || "") ? `"${(v || "").replace(/"/g, '""')}"` : v || "";

/** CSV of every token: what the owner keeps after printing the paper ones. */
export function tokensCsv(rows: Token[]): string {
  const head = "code,kind,value,note,created,status,redeemed_by,redeemed_at";
  const line = (r: Token): string =>
    [
      r.code,
      r.kind,
      String(r.value),
      csvCell(r.note),
      new Date(r.created_ms).toISOString(),
      tokenState(r),
      r.redeemed_by || "",
      r.redeemed_ms ? new Date(r.redeemed_ms).toISOString() : "",
    ].join(",");
  return [head, ...rows.map(line)].join("\n");
}

/** Printable document the owner hands to the buyer (one block per code). */
export function tokensDoc(title: string, rows: Token[], shop: string): string {
  const cards = rows
    .map(
      (r) => `<section class="card">
      <p class="shop">${esc(shop)}</p>
      <p class="code">${esc(r.code)}</p>
      <p class="what">${esc(label(r.kind, r.value))}</p>
      <p class="meta">${esc(tokenState(r))}${r.note ? " · " + esc(r.note) : ""}</p>
      <p class="hint">Enter this code in the try-on studio (Free try-ons → Details → Unlock try-ons). One use only.</p>
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
