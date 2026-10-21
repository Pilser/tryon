/* api.ts - the ONE fetch boundary for the platform frontend. Every call
   is GET/POST /api/v1/<command> and nothing else; there is no second
   surface (matches the shop's command-api::dispatch() discipline).
   Platform sign-in sessions live in localStorage under tryon.platform.v1
   - the shop dashboard's token-card pattern with a platform key. */

export interface PlatformUser {
  id: string;
  email: string;
  contact: string;
  shop_name: string;
  status: "pending" | "approved" | "suspended" | "rejected";
  deploy_allowance: number;
  deploy_used: number;
  created_ms: number;
  approved_by?: string | null;
}

const SESSION_KEY = "tryon.platform.v1";

export interface Session {
  session_id: string;
  user: PlatformUser;
}

export const loadSession = (): Session | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    return s && s.session_id && s.user ? s : null;
  } catch {
    return null;
  }
};

export const saveSession = (s: Session): void => {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* private mode: session just does not survive a reload */
  }
};

export const clearSession = (): void => {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing persisted, nothing to clean */
  }
};

/* 400s carry {message}; that text is the one worth showing humans. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(
  method: "GET" | "POST",
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

/* ------------------------------------------------------------ user --- */

export const signup = (input: { email: string; contact: string; shop_name?: string }): Promise<{ status: string }> =>
  call("POST", "/api/v1/signup", input);

export const login = (token: string): Promise<Session> =>
  call("POST", "/api/v1/login", { token });

export interface MeOut {
  user: PlatformUser;
  deploy_allowance: number;
  deploy_used: number;
}

export const me = (sessionId: string): Promise<MeOut> =>
  call("GET", "/api/v1/me", undefined, sessionId);

export interface DeployOut {
  ok: boolean;
  shop_id: string;
  subdomain: string;
  url: string | null;
}

/** One deploy uses 1 from the owner's allowance (402 when exhausted). */
export const deployShop = (
  sessionId: string,
  input: { subdomain: string; shop_name?: string; tier?: string },
): Promise<DeployOut> => call("POST", "/api/v1/deploy", input, sessionId);

/* ---------------------------------------------- shop: domain + landing */

/** A shop as the dashboards show it. */
export interface ShopView {
  id: string;
  name: string;
  subdomain: string;
  url: string;
  domain: string | null;
  hostnames: string[];
  status: string;
  tier: string;
  bundle: string;
  created_ms: number;
  credits_granted: number;
  credits_used: number;
  credits_left: number;
  tokens_redeemed: number;
  landing_files: string[];
  activity_count: number;
  owner_token?: string | null;
  workers_dev_url?: string | null;
  owner_email?: string | null;
  owner_name?: string | null;
}

/** One activity row (the audit feed). */
export interface AuditRow {
  id: string;
  actor: string;
  action: string;
  subject: string;
  meta: string;
  created_ms: number;
}

/** The owner's shops. */
export const ownerShops = (sessionId: string): Promise<{ shops: ShopView[] }> =>
  call("GET", "/api/v1/shops", undefined, sessionId);

/** The owner's activity feed. */
export const ownerActivity = (sessionId: string): Promise<{ activity: AuditRow[] }> =>
  call("GET", "/api/v1/shops/activity", undefined, sessionId);

/** Every shop (admin). */
export const adminShops = (adminToken: string): Promise<{ shops: ShopView[] }> =>
  call("GET", "/api/v1/admin/shops", undefined, adminToken);

/** The platform activity feed (admin). */
export const adminActivity = (adminToken: string): Promise<{ activity: AuditRow[] }> =>
  call("GET", "/api/v1/admin/activity", undefined, adminToken);

export interface ShopDomainOut {
  ok: boolean;
  hostname: string;
  url: string;
  zone: string;
}

/** Attach the customer's own domain (their zone must be in this account). */
export const attachShopDomain = (sessionId: string, domain: string): Promise<ShopDomainOut> =>
  call("POST", "/api/v1/shop/domain", { domain }, sessionId);

export interface LandingOut {
  ok: boolean;
  shops: Array<{
    shop_id: string;
    subdomain: string;
    url: string;
    files: string[];
  }>;
}

export const listLanding = (sessionId: string): Promise<LandingOut> =>
  call("GET", "/api/v1/shop/landing", undefined, sessionId);

/** One file of the customer's dist (path is its place in the dist). */
export const uploadLandingFile = (
  sessionId: string,
  path: string,
  file: File,
  shopId?: string,
): Promise<{ ok: boolean; path: string; files: number }> => {
  const form = new FormData();
  form.append("file", file, file.name);
  const q = new URLSearchParams({ path });
  if (shopId) q.set("shop_id", shopId);
  return callForm(`/api/v1/shop/landing/file?${q.toString()}`, form, sessionId);
};

/** Publish: the landing files become the shop's root assets. */
export const applyLanding = (
  sessionId: string,
  shopId?: string,
): Promise<{ ok: boolean; files: number; url: string }> =>
  call("POST", "/api/v1/shop/landing/apply", { shop_id: shopId ?? null }, sessionId);

/* ------------------------------------------------------------ admin --- */

export const adminUsers = (
  adminToken: string,
  status?: "pending" | "approved",
): Promise<{ users: PlatformUser[] }> =>
  call("GET", `/api/v1/admin/users${status ? `?status=${status}` : ""}`, undefined, adminToken);

export const adminApprove = (
  adminToken: string,
  userId: string,
  deployAllowance: number,
  token?: string,
): Promise<{ token: string; user: PlatformUser }> =>
  call(
    "POST",
    "/api/v1/admin/approve",
    {
      user_id: userId,
      deploy_allowance: deployAllowance,
      ...(token ? { token } : {}),
    },
    adminToken,
  );

export const adminReject = (adminToken: string, userId: string, reason?: string): Promise<void> =>
  call("POST", "/api/v1/admin/reject", { user_id: userId, ...(reason ? { reason } : {}) }, adminToken);

export const adminAllowance = (
  adminToken: string,
  userId: string,
  deployAllowance: number,
): Promise<{ user: PlatformUser }> =>
  call("POST", "/api/v1/admin/allowance", { user_id: userId, deploy_allowance: deployAllowance }, adminToken);

export const adminSuspend = (adminToken: string, userId: string): Promise<{ user: PlatformUser }> =>
  call("POST", "/api/v1/admin/suspend", { user_id: userId }, adminToken);

export const adminReactivate = (adminToken: string, userId: string): Promise<{ user: PlatformUser }> =>
  call("POST", "/api/v1/admin/reactivate", { user_id: userId }, adminToken);

/* ------------------------------------------------------- shop tokens --- */

/* 4-digit platform codes: the admin mints and prints them, a shop
   redeems one to top up its tryon_tokens balance. */
export interface ShopToken {
  code: string;
  shop_id: string | null;
  status: "active" | "used" | "cancelled";
  created_ms: number;
  redeemed_ms: number | null;
  redeemed_by: string | null;
  cancelled_ms: number | null;
  note: string;
  /** How many try-on credits the code is worth. */
  credits: number;
}

export const adminTokens = (adminToken: string, status?: string): Promise<{ tokens: ShopToken[] }> =>
  call("GET", `/api/v1/admin/tokens${status ? `?status=${status}` : ""}`, undefined, adminToken);

export const adminMintTokens = (
  adminToken: string,
  count: number,
  note?: string,
  credits = 1,
): Promise<{ tokens: ShopToken[] }> =>
  call(
    "POST",
    "/api/v1/admin/tokens/mint",
    { count, credits, ...(note ? { note } : {}) },
    adminToken,
  );

export const adminCancelToken = (adminToken: string, code: string): Promise<{ token: ShopToken }> =>
  call("POST", "/api/v1/admin/tokens/cancel", { code }, adminToken);

/** Phase G manual billing gate: pending credit requests from shops. */
export interface CreditRequest {
  id: string;
  shop_id: string;
  requested: number;
  reason: string;
  status: string;
  created_ms: number;
}

export const adminCreditRequests = (
  adminToken: string,
): Promise<{ requests: CreditRequest[] }> =>
  call("GET", "/api/v1/admin/credits", undefined, adminToken);

export const adminCreditApprove = (
  adminToken: string,
  id: string,
): Promise<{ ok: boolean; granted: number; shop_id: string }> =>
  call("POST", "/api/v1/admin/credits/approve", { id }, adminToken);

export const adminCreditReject = (
  adminToken: string,
  id: string,
  reason?: string,
): Promise<{ ok: boolean }> =>
  call("POST", "/api/v1/admin/credits/reject", { id, reason }, adminToken);
