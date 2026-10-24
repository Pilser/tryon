/* core/whatsapp.ts - wa.me link builders. Pure, no DOM.
   Numbers are stored as E.164 digits (e.g. 256755304241). A valid target
   is 8..15 digits; when the owner has no usable number, `inquireUrl`
   returns "" so the UI hides the link instead of emitting a bare
   wa.me/?text= (which is what the Share button does - the two must never
   look the same). */
import { isPlausibleWa } from "./countries";

const digits = (s: string): string => String(s || "").replace(/\D/g, "");

/**
 * Inquire carries the FULL product URL, not just its id: the owner taps
 * the message and lands on the product page directly. Returns "" when
 * the owner's number is missing or implausible.
 */
export const inquireUrl = (owner: string, shop: string, title: string, productUrl: string): string => {
  const d = digits(owner);
  if (!isPlausibleWa(d)) return "";
  return "https://wa.me/" + d + "?text=" +
    encodeURIComponent(
      `Hi ${shop}! I like ${title}. ${productUrl || "(link unavailable)"} Is it available?`,
    );
};

export const shareUrl = (origin: string, productId: string): string =>
  origin.replace(/\/$/, "") + "/app/studio.html?id=" + encodeURIComponent(productId);

export const waShareUrl = (origin: string, title: string, productId: string): string =>
  "https://wa.me/?text=" + encodeURIComponent(`Check this out: ${title} ${shareUrl(origin, productId)}`);
