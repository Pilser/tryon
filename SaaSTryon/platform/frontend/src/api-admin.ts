/* api-admin.ts - the control-plane calls of the platform frontend: the
   shop settings, the total shop delete, the redeploys, the per-shop
   codes and the bundles. api.ts keeps the session and the read side;
   this file owns the writes that change a shop. Same bearer rules: the
   admin calls carry the ADMIN_TOKEN, the owner calls the session id. */

import { ApiError, type ShopToken } from "./api";

/** The shop settings that may be changed. */
export interface ShopSettings {
  name?: string;
  tier?: string;
  status?: string;
}

export interface ShopSettingsOut {
  ok: boolean;
  id: string;
  name: string;
  tier: string;
  status: string;
}

/** The delete answer: what went with the shop. */
export interface ShopDeleteOut {
  ok: boolean;
  deleted: string;
  removed: string[];
}

export interface RedeployOut {
  ok: boolean;
  shop_id: string;
  url: string | null;
}

export interface TokenMintOut {
  ok: boolean;
  tokens: ShopToken[];
}

export interface BundlesOut {
  bundles: string[];
}

export interface BundleUploadOut {
  ok: boolean;
  version: string;
  files: string[];
}

async function call<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  bearer?: string,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) {
    throw new ApiError(res.status, data.message || `request failed (${res.status})`);
  }
  return data as T;
}

/** A multipart call (the browser sets the boundary, so no content-type). */
async function callForm<T>(
  path: string,
  form: FormData,
  bearer?: string,
): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) {
    throw new ApiError(res.status, data.message || `request failed (${res.status})`);
  }
  return data as T;
}

const shop = (id: string): string => `/api/v1/admin/shops/${encodeURIComponent(id)}`;

/* ------------------------------------------------------------- shops --- */

/** The shop's settings: the name, the tier and the status. */
export const adminUpdateShop = (
  adminToken: string,
  shopId: string,
  settings: ShopSettings,
): Promise<ShopSettingsOut> =>
  call("PATCH", shop(shopId), settings, adminToken);

/** The shop is gone - script, database, domains, images and rows. */
export const adminDeleteShop = (
  adminToken: string,
  shopId: string,
): Promise<ShopDeleteOut> => call("DELETE", shop(shopId), undefined, adminToken);

/** One shop on another bundle (the data of the shop stays). */
export const adminRedeployShop = (
  adminToken: string,
  shopId: string,
  bundleId: string,
): Promise<RedeployOut> =>
  call("POST", `${shop(shopId)}/redeploy`, { bundle_id: bundleId }, adminToken);

/* ------------------------------------------------------------- codes --- */

/** Codes that belong to this shop from the start. */
export const adminMintShopTokens = (
  adminToken: string,
  shopId: string,
  count: number,
  note?: string,
): Promise<TokenMintOut> =>
  call(
    "POST",
    `${shop(shopId)}/tokens`,
    { count, ...(note ? { note } : {}) },
    adminToken,
  );

/** A code removed for good (a cancelled code keeps its row). */
export const adminDeleteToken = (
  adminToken: string,
  code: string,
): Promise<{ ok: boolean; deleted: string }> =>
  call(
    "POST",
    `/api/v1/admin/tokens/${encodeURIComponent(code)}/delete`,
    undefined,
    adminToken,
  );

/* ----------------------------------------------------------- bundles --- */

/** The bundle versions in the BUNDLES bucket. */
export const adminBundles = (adminToken: string): Promise<BundlesOut> =>
  call("GET", "/api/v1/admin/bundles", undefined, adminToken);

/**
 * Upload a bundle: the files land under `bundles/<version>/…` and the
 * file name of a part is its path inside the bundle (so `assets/x.png`
 * stays `assets/x.png`).
 */
export const adminUploadBundle = (
  adminToken: string,
  version: string,
  files: { path: string; file: File }[],
): Promise<BundleUploadOut> => {
  const form = new FormData();
  for (const f of files) form.append("file", f.file, f.path);
  const q = new URLSearchParams({ version });
  return callForm(`/api/v1/admin/bundles?${q.toString()}`, form, adminToken);
};

/* ------------------------------------------------------------- owner --- */

/** The owner mints a code for their own shop. */
export const ownerMintTokens = (
  sessionId: string,
  count: number,
  note?: string,
): Promise<TokenMintOut> =>
  call(
    "POST",
    "/api/v1/shop/tokens",
    { count, ...(note ? { note } : {}) },
    sessionId,
  );

/** The owner moves their own shop to another bundle. */
export const ownerRedeploy = (
  sessionId: string,
  bundleId: string,
): Promise<RedeployOut> =>
  call("POST", "/api/v1/shop/redeploy", { bundle_id: bundleId }, sessionId);
