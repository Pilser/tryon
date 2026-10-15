/* core/whatsapp.js — wa.me link builders. Pure, no DOM. */
const digits = (s) => String(s || "").replace(/\D/g, "");

export const inquireUrl = (owner, shop, title, productId) =>
  "https://wa.me/" + digits(owner) + "?text=" +
  encodeURIComponent(`Hi ${shop}! I like ${title} (${productId}). Is it available?`);

export const shareUrl = (origin, productId) =>
  origin.replace(/\/$/, "") + "/app/product.html?id=" + encodeURIComponent(productId);

export const waShareUrl = (origin, title, productId) =>
  "https://wa.me/?text=" + encodeURIComponent(`Check this out: ${title} ${shareUrl(origin, productId)}`);
