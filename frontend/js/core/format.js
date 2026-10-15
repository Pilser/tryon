/* core/format.js — pure formatting. No DOM, no network. */
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export const money = (p) => (p.price_cents / 100).toFixed(2) + " " + p.currency;

export const mb = (bytes) => (bytes / 1048576).toFixed(1) + " MB";
