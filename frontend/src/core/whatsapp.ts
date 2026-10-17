/* core/whatsapp.ts - wa.me link builders. Pure, no DOM. */
const digits = (s: string): string => String(s || "").replace(/\D/g, "");

/**
 * Inquire carries the FULL product URL, not just its id: the owner taps
 * the message and lands on the product page directly.
 */
export const inquireUrl = (owner: string, shop: string, title: string, productUrl: string): string =>
  "https://wa.me/" + digits(owner) + "?text=" +
  encodeURIComponent(
    `Hi ${shop}! I like ${title}. ${productUrl || "(link unavailable)"} Is it available?`,
  );

export const shareUrl = (origin: string, productId: string): string =>
  origin.replace(/\/$/, "") + "/app/product.html?id=" + encodeURIComponent(productId);

export const waShareUrl = (origin: string, title: string, productId: string): string =>
  "https://wa.me/?text=" + encodeURIComponent(`Check this out: ${title} ${shareUrl(origin, productId)}`);
