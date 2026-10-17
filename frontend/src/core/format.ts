/* core/format.ts - pure formatting. No DOM, no network. */
import { currencyInfo } from "./currencies";

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/* `12,000 UGX` / `19.99 USD`: grouping + the currency's own decimals. */
export const money = (p: { price_cents: number; currency: string }): string =>
  group((p.price_cents || 0) / 100, currencyInfo(p.currency).decimals) + " " + p.currency;

/* Owner form takes major units (`12000` UGX / `19.99` USD); storage is
   always minor units, so every save multiplies by 100 once, here. */
export const toMinor = (major: string | number): number => {
  const n = Number(String(major ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
};

export const toMajor = (cents: number): string =>
  String(Number(((cents || 0) / 100).toFixed(2)));

function group(value: number, decimals: number): string {
  const fixed = Math.abs(value).toFixed(Math.max(0, Math.min(2, decimals)));
  const [int, frac] = fixed.split(".");
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? withSep + "." + frac : withSep;
}

export const mb = (bytes: number): string => (bytes / 1048576).toFixed(1) + " MB";

/* Human size for storage chips and totals: 742 B / 84 KB / 1.2 MB. */
export const size = (bytes: number): string => {
  const b = Math.max(0, Math.round(bytes || 0));
  if (b < 1024) return b + " B";
  if (b < 1048576) return Math.round(b / 1024) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
};

/* Navbar brand: logo (when the owner uploaded one) + shop name. */
export const brandHTML = (shop: { shop_name: string; logo_url: string }): string =>
  (shop.logo_url
    ? `<img src="${esc(shop.logo_url)}" height="26" style="vertical-align:-6px;margin-right:8px;border-radius:6px" alt=""/>`
    : "") + esc(shop.shop_name);
