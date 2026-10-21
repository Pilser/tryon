/* demo.ts - the demo shops, in ONE place. The landing page links to
   them, embeds their feed and falls back to a committed snapshot when
   the feed is unreachable (DESIGN.md 2.8).

   These are real, deployed shops on the same control plane as every
   other tenant - not mock-ups. The catalogue you see on the landing
   page is read from their /api/feed, so the prices and the photos are
   the shop's own. */

export const DEMO = {
  /* The retail demo shop: the one the hero embeds. */
  shop: "https://jamcollections.latiforge.com",
  feed: "https://jamcollections.latiforge.com/api/feed",
  studio: "https://jamcollections.latiforge.com/app/studio.html?owner=1",
  app: "https://jamcollections.latiforge.com/app/",
  /* The second demo shop (a boutique on the same platform). */
  altShop: "https://amira-boutique-2.latiforge.com",
  altFeed: "https://amira-boutique-2.latiforge.com/api/feed",
  /* The committed snapshot of the demo catalogue: the grid is never
     empty, even with no network. */
  fallback: "/demo-feed.json",
} as const;

export interface FeedItem {
  id: string;
  title: string;
  price_cents: number;
  currency: string;
  image: string;
  url: string;
  category: string;
  sizes: string[];
}

export interface FeedShop {
  name: string;
  logo: string;
  url: string;
  studio: string;
}

export interface Feed {
  shop: FeedShop;
  items: FeedItem[];
}

/* Currencies with no minor unit (the shop formats the same way:
   price_cents / 100, then the currency's own decimals). */
const NO_DECIMALS: Record<string, number> = {
  UGX: 0,
  RWF: 0,
  BIF: 0,
  DJF: 0,
  JPY: 0,
};

/* `24000000` + `UGX` -> `240,000 UGX` (the shop's own rule). */
export function money(priceCents: number, currency: string): string {
  const code = (currency || "UGX").toUpperCase();
  const decimals = NO_DECIMALS[code] ?? 2;
  const value = (priceCents || 0) / 100;
  const text = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return `${text} ${code}`;
}

/* The demo catalogue: the live feed first, the committed snapshot
   second. The snapshot is served from our own origin, so the grid is
   never empty - not offline, not during a deploy, not if a shop is
   mid-redeploy. */
export async function loadDemoFeed(signal?: AbortSignal): Promise<{
  feed: Feed;
  live: boolean;
}> {
  try {
    const res = await fetch(DEMO.feed, { signal, cache: "default" });
    if (!res.ok) throw new Error(String(res.status));
    const feed = (await res.json()) as Feed;
    if (feed && Array.isArray(feed.items) && feed.items.length > 0) {
      return { feed, live: true };
    }
    /* The shop answered, but it has nothing published yet: fall back
       so the section still shows garments. */
    const snap = await loadFallback(signal);
    return { feed: snap, live: false };
  } catch {
    return { feed: await loadFallback(signal), live: false };
  }
}

async function loadFallback(signal?: AbortSignal): Promise<Feed> {
  const res = await fetch(DEMO.fallback, { signal });
  if (!res.ok) throw new Error("demo snapshot unavailable");
  return (await res.json()) as Feed;
}
