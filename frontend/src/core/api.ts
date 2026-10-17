/* core/api.ts - the ONLY file that talks HTTP. All endpoints, one place. */
import type { Category, Product, ShopSettings } from "./types";
import type { Allowance } from "./device";
import { DEFAULT_CURRENCY } from "./currencies";

interface SyncBody {
  product_id: string;
  title: string;
  description: string;
  image_url: string;
  person_image_id: string;
  device_id: string;
}

interface SyncResult {
  status: number;
  body: {
    generationId?: string;
    resultImageUrl?: string;
    message?: string;
    status?: string;
    code?: string;
  } & Partial<Allowance>;
}

export async function api<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, opts);
  const j = (await r.json().catch(() => ({}))) as T & { message?: string };
  if (!r.ok) throw new Error(j.message || ("HTTP " + r.status));
  return j as T;
}

export const getShop = (): Promise<ShopSettings> =>
  api<ShopSettings>("/api/shop-settings").catch(() => ({ shop_name: "Shop", owner_whatsapp: "", currency: DEFAULT_CURRENCY, logo_url: "" }));

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

export const createProduct = (formData: FormData, token = ""): Promise<{ id: string }> =>
  api("/api/studio/products", {
    method: "POST",
    body: formData,
    ...(token ? { headers: { Authorization: "Bearer " + token } } : {}),
  });

export const listCategories = (): Promise<Category[]> =>
  api<Category[]>("/api/categories").catch(() => []);

export const createCategory = (formData: FormData, token = ""): Promise<Category> =>
  api("/api/studio/categories", {
    method: "POST",
    body: formData,
    ...(token ? { headers: { Authorization: "Bearer " + token } } : {}),
  });

export const saveShop = (formData: FormData, token = ""): Promise<ShopSettings> =>
  api("/api/studio/shop", {
    method: "POST",
    body: formData,
    ...(token ? { headers: { Authorization: "Bearer " + token } } : {}),
  });

/* Owner auth (stateless Bearer; browser keeps the token, logout clears it). */
export const ownerLogin = (token: string): Promise<{ ok: boolean }> =>
  api("/api/owner/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

export const ownerLogout = (): Promise<{ ok: boolean }> =>
  api<{ ok: boolean }>("/api/owner/logout", { method: "POST" }).catch(() => ({ ok: true }));

/* Shopper identity: register the device, give a contact, redeem a code. */
const jsonPost = <T>(path: string, body: unknown): Promise<T> =>
  api<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const registerDevice = (id: string, fingerprint: string): Promise<Allowance> =>
  jsonPost<Allowance>("/api/device", { id, fingerprint });

export const saveContact = (device_id: string, name: string, whatsapp: string): Promise<Allowance> =>
  jsonPost<Allowance>("/api/device/contact", { device_id, name, whatsapp });

export const redeemToken = (device_id: string, code: string): Promise<Allowance> =>
  jsonPost<Allowance>("/api/device/redeem", { device_id, code });

/* Owner dashboard (Bearer token). */
export interface UsageOut {
  free_tries: number;
  devices_total: number;
  tryons_total: number;
  tokens_total: number;
  tokens_redeemed: number;
  owner_whatsapp: string;
  devices: Array<{
    id: string;
    name: string;
    whatsapp: string;
    fingerprint: string;
    used: number;
    bonus: number;
    bonus_until_ms: number;
    blocked: number;
    first_seen_ms: number;
    last_seen_ms: number;
  }>;
  tokens: Array<{
    code: string;
    kind: string;
    value: number;
    note: string;
    created_ms: number;
    redeemed_by: string;
    redeemed_ms: number;
  }>;
}

const ownerPost = <T>(path: string, body: unknown, token: string): Promise<T> =>
  api<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify(body),
  });

export const studioUsage = (token: string): Promise<UsageOut> =>
  api<UsageOut>("/api/studio/usage", {
    ...(token ? { headers: { Authorization: "Bearer " + token } } : {}),
  });

export const mintTokens = (
  token: string,
  body: { kind: string; value: number; count: number; note: string },
): Promise<{ kind: string; value: number; codes: string[] }> =>
  ownerPost("/api/studio/tokens", body, token);

export const deleteToken = (token: string, code: string): Promise<{ ok: boolean }> =>
  ownerPost("/api/studio/tokens/delete", { code }, token);

export const saveSettings = (token: string, freeTries: number): Promise<{ free_tries: number }> =>
  ownerPost("/api/studio/settings", { free_tries: freeTries }, token);

export const deviceBlock = (token: string, deviceId: string, blocked: boolean): Promise<unknown> =>
  ownerPost("/api/studio/devices/block", { device_id: deviceId, blocked }, token);

/** Owner's remaining Genlook credits (each try-on costs 1). */
export const studioCredits = (token: string): Promise<{ creditBalance: number }> =>
  api<{ creditBalance: number }>("/api/studio/credits", {
    ...(token ? { headers: { Authorization: "Bearer " + token } } : {}),
  });

export async function pollGeneration(id: string, onTick: (secs: number) => void): Promise<string> {
  for (let n = 0; n < 45; n++) {
    onTick((n + 1) * 2);
    await new Promise((r) => setTimeout(r, 2000));
    const j = await generation(id);
    if (j.status === "COMPLETED" && j.resultImageUrl) return j.resultImageUrl;
    if (j.status === "FAILED") throw new Error("Generation failed (credit refunded) - try another photo.");
  }
  throw new Error("Still running after ~90s. Reload and try again.");
}
