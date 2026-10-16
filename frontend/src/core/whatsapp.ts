/* core/whatsapp.ts — wa.me link builders. Pure, no DOM. */
const digits = (s: string): string => String(s || "").replace(/\D/g, "");

export const inquireUrl = (owner: string, shop: string, title: string, productId: string): string =>
  "https://wa.me/" + digits(owner) + "?text=" +
  encodeURIComponent(`Hi ${shop}! I like ${title} (${productId}). Is it available?`);

export const shareUrl = (origin: string, productId: string): string =>
  origin.replace(/\/$/, "") + "/app/product.html?id=" + encodeURIComponent(productId);

export const waShareUrl = (origin: string, title: string, productId: string): string =>
  "https://wa.me/?text=" + encodeURIComponent(`Check this out: ${title} ${shareUrl(origin, productId)}`);
