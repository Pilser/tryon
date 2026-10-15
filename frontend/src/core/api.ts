/* core/api.ts — the ONLY file that talks HTTP. All endpoints, one place. */
import type { Product, ShopSettings } from "./types";

interface SyncBody {
  product_id: string;
  title: string;
  description: string;
  image_url: string;
  person_image_id: string;
}

interface SyncResult {
  status: number;
  body: {
    generationId?: string;
    resultImageUrl?: string;
    message?: string;
    status?: string;
  };
}

export async function api<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, opts);
  const j = (await r.json().catch(() => ({}))) as T & { message?: string };
  if (!r.ok) throw new Error(j.message || ("HTTP " + r.status));
  return j as T;
}

export const getShop = (): Promise<ShopSettings> =>
  api<ShopSettings>("/api/shop-settings").catch(() => ({ shop_name: "Shop", owner_whatsapp: "", currency: "USD", logo_url: "" }));

export const listProducts = (params: Record<string, string> = {}): Promise<Product[]> =>
  api<Product[]>("/api/products?" + new URLSearchParams(params).toString()).catch(() => []);

export const getProduct = (id: string): Promise<Product> =>
  api<Product>("/api/products/" + encodeURIComponent(id));

export const uploadPerson = (blob: Blob): Promise<{ imageId: string; imageUrl?: string }> => {
  const fd = new FormData();
  fd.append("file", blob, "person.jpg");
  return api("/api/person-upload", { method: "POST", body: fd });
};

export const tryOnSync = (body: SyncBody): Promise<SyncResult> =>
  fetch("/api/try-on/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

export const generation = (id: string): Promise<{ status: string; resultImageUrl?: string }> =>
  api("/api/generations/" + encodeURIComponent(id));

export const createProduct = (formData: FormData): Promise<{ id: string }> =>
  api("/api/admin/products", { method: "POST", body: formData });

export async function pollGeneration(id: string, onTick: (secs: number) => void): Promise<string> {
  for (let n = 0; n < 45; n++) {
    onTick((n + 1) * 2);
    await new Promise((r) => setTimeout(r, 2000));
    const j = await generation(id);
    if (j.status === "COMPLETED" && j.resultImageUrl) return j.resultImageUrl;
    if (j.status === "FAILED") throw new Error("Generation failed (credit refunded) — try another photo.");
  }
  throw new Error("Still running after ~90s. Reload and try again.");
}
