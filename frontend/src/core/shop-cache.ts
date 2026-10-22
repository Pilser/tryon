/* core/shop-cache.ts - localStorage boot cache for the shop identity and
   the product list. Purpose: a page paints its brand + grid (or a close
   approximation, filtered client-side) from the previous page's data
   before the API answers, then keeps the cache warm for the next page.
   Only api.ts talks HTTP; this module decides what is FRESH ENOUGH to
   paint first. */
import {
  getShop as fetchShop,
  listProducts as fetchProducts,
} from "./api";
import type { Product, ShopSettings } from "./types";

const SHOP_KEY = "tryon:shop";
const PRODUCTS_KEY = "tryon:products";
const PRODUCT_KEY = "tryon:product";
const TTL_MS = 60_000; // revalidate after this, paint from cache regardless

interface Stamp<T> {
  ts: number;
  data: T;
}

function read<T>(key: string): Stamp<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const stamp = JSON.parse(raw) as Stamp<T>;
    return stamp && typeof stamp.ts === "number" ? stamp : null;
  } catch {
    return null;
  }
}

function write<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data } satisfies Stamp<T>));
  } catch {
    /* private mode / quota: a cache miss is only a slower first paint */
  }
}

function fresh(key: string): boolean {
  const st = read<never>(key);
  return st !== null && Date.now() - st.ts < TTL_MS;
}

/** Shop as the last page saw it, or null on the very first visit. */
export function shopSync(): ShopSettings | null {
  return read<ShopSettings>(SHOP_KEY)?.data ?? null;
}

/** All products as the last page saw them, or null on the first visit. */
export function productsSync(): Product[] | null {
  return read<Product[]>(PRODUCTS_KEY)?.data ?? null;
}

/** One previously-viewed product (instant back-navigation). */
export function productSync(id: string): Product | null {  if (!id) return null;
  return read<Product>(PRODUCT_KEY + ":" + id)?.data ?? null;
}

function storeProduct(id: string, p: Product): void {
  if (id && p) write(PRODUCT_KEY + ":" + id, p);
}
export { storeProduct };

/** Owner-side saves must not serve a stale grid: studio/product edits
    drop the list cache so the next landing page refetches. */
export function invalidateProducts(): void {
  try {
    localStorage.removeItem(PRODUCTS_KEY);
  } catch {
    /* noop */
  }
}

/** Cached shop when fresh, one round trip otherwise. */
export async function shop(): Promise<ShopSettings> {
  if (fresh(SHOP_KEY)) return (shopSync() as ShopSettings) ?? (await fetchShop());
  const s = await fetchShop();
  if (s && s.shop_name) write(SHOP_KEY, s); // the api fallback shape ("Shop") is not cache-worthy
  return s;
}

/** Cached product list when fresh, one round trip otherwise. */
export async function all(): Promise<Product[]> {
  if (fresh(PRODUCTS_KEY)) return productsSync() ?? (await fetchProducts());
  const list = await fetchProducts();
  if (list && list.length) write(PRODUCTS_KEY, list);
  return list;
}
