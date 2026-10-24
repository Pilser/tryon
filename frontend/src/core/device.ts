/* core/device.ts - device identity and the free-try-on allowance.
   The device id lives in localStorage; when the storage is wiped, the
   server restores the same id from the browser fingerprint, and the
   WhatsApp number the shopper gives is the durable identity after that. */
export interface Allowance {
  device_id: string;
  name: string;
  whatsapp: string;
  free_tries: number;
  used: number;
  bonus: number;
  bonus_until_ms: number;
  /** -1 = unlimited (a time token window is open). */
  remaining: number;
  owner_whatsapp: string;
  /** 1 = the owner blocked this device (no more try-ons). */
  blocked?: number;
}

const ID_KEY = "tryon.device.v1";

/** Browser signals the server hashes into a restore key. No canvas (Safari
    randomizes it): hardware-shape signals only, which are stable. */
export const fingerprintParts = (): string => {
  const tz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      return "";
    }
  })();
  return [
    navigator.userAgent || "",
    `${screen.width}x${screen.height}`,
    tz,
    navigator.language || "",
    navigator.platform || "",
    `${navigator.hardwareConcurrency ?? ""}`,
    `${(navigator as { deviceMemory?: number }).deviceMemory ?? ""}`,
    `${navigator.maxTouchPoints ?? ""}`,
  ].join("|");
};

const newId = (): string => {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().replace(/-/g, "");
  return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
};

/** This browser's device id, created on first use. */
export const deviceId = (): string => {
  try {
    const saved = localStorage.getItem(ID_KEY);
    if (saved && saved.length >= 8) return saved;
    const id = newId();
    localStorage.setItem(ID_KEY, id);
    return id;
  } catch {
    return newId();
  }
};

/** Adopt the id the server resolved (it may have restored a known one). */
export const rememberDeviceId = (id: string): void => {
  try {
    if (id) localStorage.setItem(ID_KEY, id);
  } catch {
    /* private mode: the id stays in memory for this page only */
  }
};

/** True when this device has nothing left to spend (or is blocked). */
export const isSpent = (a: Allowance): boolean =>
  !!a.blocked ||
  (a.remaining === 0 && a.bonus <= 0 && a.bonus_until_ms <= Date.now());

/** "6 try-ons" / "unlimited for 2 h" / "used up", for the dashboard + banner. */
export const allowanceLabel = (a: Allowance): string => {
  if (a.bonus_until_ms > Date.now()) {
    const mins = Math.max(1, Math.round((a.bonus_until_ms - Date.now()) / 60000));
    const left = mins >= 60 ? `${Math.round(mins / 60)} h` : `${mins} min`;
    return `unlimited for another ${left}`;
  }
  const left = Math.max(0, a.free_tries - a.used) + a.bonus;
  return left === 0 ? "used up" : `${left} try-on${left === 1 ? "" : "s"} left`;
};
