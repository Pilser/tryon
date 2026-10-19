/* rig.ts - `bun run rig`: the local browser-probing rig, no platform
   worker needed (mirrors .local-rig/harness.cjs, in-memory). Serves
   dist/ on :8822 (8823 on clash) and stubs the REST contract:
   two pending users + one approved shop are seeded; approve mints a
   plat_ sign-in token; login exchanges it for a session. ADMIN_TOKEN
   defaults to "plat-admin-2026" (override with ADMIN_TOKEN=...). */
import path from "node:path";
import type { PlatformUser } from "./src/api";

const DIST = new URL("./dist/", import.meta.url).pathname;
const ADMIN = process.env.ADMIN_TOKEN || "plat-admin-2026";

/* ------------------------------------------------------------ state --- */
const users: PlatformUser[] = [
  {
    id: "u_amina", name: "Amina", shop_name: "Amina's Kanzu Co",
    email: "amina@kazicloth.co", contact: "0772000111", status: "pending",
    role: "user", deploy_allowance: 0, deploy_used: 0,
  },
  {
    id: "u_nazzi", name: "Salimah", shop_name: "Nazzi Textiles",
    email: "salimah@nazzi.ug", contact: "0772000222", status: "pending",
    role: "user", deploy_allowance: 0, deploy_used: 0,
  },
  {
    id: "u_zesta", name: "Zesta", shop_name: "Zesta Emporium",
    email: "owner@zesta.co", contact: "0772000333", status: "approved",
    role: "user", deploy_allowance: 3, deploy_used: 1,
  },
];
const issued = new Map<string, string>(); // plat_ token -> user id
const sessions = new Map<string, string>(); // session id -> user id

const admins = (): PlatformUser => ({
  id: "u_admin", name: "Platform", shop_name: "SaaSTryon HQ",
  email: "ops@crowdy.app", contact: "0700000000", status: "approved",
  role: "admin", deploy_allowance: 0, deploy_used: 0,
});
const hex = (len: number): string =>
  Array.from({ length: len }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
const pub = (u: PlatformUser) => ({ ...u });
const find = (id: string): PlatformUser | undefined =>
  id === "u_admin" ? admins() : users.find((u) => u.id === id);
const list = (status: string): PlatformUser[] =>
  status === "pending"
    ? users.filter((u) => u.status === "pending").map(pub)
    : users.filter((u) => u.status === "approved" || u.status === "suspended").map(pub);

/* ------------------------------------------------------------ routes --- */
async function api(req: Request, url: URL): Promise<Response> {
  const auth = () => (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const body = await req.clone().json().catch(() => ({} as Record<string, unknown>));
  const json = (data: unknown, status = 200): Response => Response.json(data, { status });

  if (url.pathname === "/api/v1/signup" && req.method === "POST") {
    const email = String(body.email || "").trim();
    const contact = String(body.contact || "").replace(/\D/g, "");
    const shop = String(body.shop_name || "").trim();
    if (!email.includes("@")) return json({ message: "A real email is required." }, 400);
    if (contact.length < 9) return json({ message: "A full WhatsApp number is required." }, 400);
    if (users.some((u) => u.email === email)) {
      return json({ message: "That email already has a request." }, 409);
    }
    users.push({
      id: "u_" + hex(6), name: shop || email.split("@")[0], shop_name: shop,
      email, contact, status: "pending", role: "user",
      deploy_allowance: 0, deploy_used: 0,
    });
    return json({ status: "pending" });
  }

  if (url.pathname === "/api/v1/login" && req.method === "POST") {
    const token = String(body.token || "").trim();
    const user = token === ADMIN ? admins() : find(issued.get(token) || "");
    if (!user) return json({ message: "No such sign-in token." }, 401);
    const sid = "ses_" + hex(12);
    sessions.set(sid, user.id);
    return json({ session_id: sid, user: pub(user) });
  }

  if (url.pathname === "/api/v1/me" && req.method === "GET") {
    const user = find(sessions.get(auth()) || "");
    if (!user) return json({ message: "Session expired - sign in again." }, 401);
    return json({ user: pub(user), deploy_allowance: user.deploy_allowance, deploy_used: user.deploy_used });
  }

  if (url.pathname.startsWith("/api/v1/admin/")) {
    if (auth() !== ADMIN) return json({ message: "That is not the ADMIN_TOKEN." }, 401);
    if (url.pathname === "/api/v1/admin/users" && req.method === "GET") {
      return json({ users: list(url.searchParams.get("status") || "pending") });
    }
    if (req.method === "POST") {
      const user = find(String(body.user_id || ""));
      if (!user) return json({ message: "Unknown user." }, 404);
      switch (url.pathname.split("/admin/")[1]) {
        case "approve": {
          const allow = Math.max(0, Math.min(100, Number(body.deploy_allowance) || 0));
          user.status = "approved";
          user.deploy_allowance = allow;
          const token = "plat_" + hex(16);
          issued.set(token, user.id);
          return json({ token, user: pub(user) });
        }
        case "reject":
          user.status = "rejected";
          return new Response(null, { status: 204 });
        case "allowance":
          user.deploy_allowance = Math.max(0, Math.min(100, Number(body.deploy_allowance) || 0));
          return json({ user: pub(user) });
        case "suspend":
          user.status = "suspended";
          return json({ user: pub(user) });
        case "reactivate":
          user.status = "approved";
          return json({ user: pub(user) });
        default:
          return json({ message: "not found" }, 404);
      }
    }
  }
  return json({ message: "not found" }, 404);
}

/* ------------------------------------------------------------ serve --- */
const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

function start(port: number): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname.startsWith("/api/")) return api(req, url);
      let rel = url.pathname === "/" ? "/signup.html" : url.pathname;
      if (rel.endsWith("/")) rel += "index.html";
      const file = Bun.file(path.join(DIST, rel));
      if (!(await file.exists())) return new Response("not found", { status: 404 });
      return new Response(file, {
        headers: {
          "content-type": MIME[path.extname(rel)] || "application/octet-stream",
          "cache-control": "no-store",
        },
      });
    },
  });
}

const server = await (async () => {
  try {
    return start(8822);
  } catch {
    return start(8823);
  }
})();
console.log(
  `[rig] platform frontend on http://localhost:${server.port}/ ` +
    `(dist static + REST stubs; ADMIN_TOKEN=${ADMIN}; ${users.length} seeded users)`,
);
