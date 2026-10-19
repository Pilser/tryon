/* api.ts - the ONE fetch boundary for the platform frontend. Every call
   is GET/POST /api/v1/<command> and nothing else; there is no second
   surface (matches the shop's command-api::dispatch() discipline).
   Platform sign-in sessions live in localStorage under tryon.platform.v1
   - the shop dashboard's token-card pattern with a platform key. */

export interface PlatformUser {
  id: string;
  email: string;
  contact: string;
  name: string;
  shop_name: string;
  status: "pending" | "approved" | "suspended" | "rejected";
  role: "admin" | "user";
  deploy_allowance: number;
  deploy_used: number;
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
): Promise<{ token: string; user: PlatformUser }> =>
  call("POST", "/api/v1/admin/approve", { user_id: userId, deploy_allowance: deployAllowance }, adminToken);

export const adminReject = (adminToken: string, userId: string, reason?: string): Promise<void> =>
  call("POST", "/api/v1/admin/reject", { user_id: userId, ...(reason ? { reason } : {}) }, adminToken);

export const adminAllowance = (
  adminToken: string,
  userId: string,
  deployAllowance: number,
): Promise<{ user: PlatformUser }> =>
  call("POST", "/api/v1/admin/allowance", { user_id: userId, deploy_allowance: deployAllowance }, adminToken);

export const adminSuspend = (
  adminToken: string,
  userId: string,
  reactivate: boolean,
): Promise<{ user: PlatformUser }> =>
  call("POST", "/api/v1/admin/suspend", { user_id: userId, ...(reactivate ? { reactivate } : {}) }, adminToken);
