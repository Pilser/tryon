/* core/format.ts - pure formatting. No DOM, no network. */
export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

export const money = (p: { price_cents: number; currency: string }): string =>
  (p.price_cents / 100).toFixed(2) + " " + p.currency;

export const mb = (bytes: number): string => (bytes / 1048576).toFixed(1) + " MB";

/* Navbar brand: logo (when the owner uploaded one) + shop name. */
export const brandHTML = (shop: { shop_name: string; logo_url: string }): string =>
  (shop.logo_url
    ? `<img src="${esc(shop.logo_url)}" height="26" style="vertical-align:-6px;margin-right:8px;border-radius:6px" alt=""/>`
    : "") + esc(shop.shop_name);
