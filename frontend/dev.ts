/* dev.ts — `bun run dev`: rebuild on save + serve frontend on :8811.
   /api/* proxies to the worker harness (:8787). Requires the harness up:
   it owns PRODUCTS_JSON/R2 stubs and the Genlook key forwarding. */
import { watch } from "node:fs";
import path from "node:path";

const ROOT = new URL(".", import.meta.url).pathname;
const PORT = 8811;
const API_UPSTREAM = "http://localhost:8787";

async function build(label: string): Promise<void> {
  const proc = Bun.spawn(["bun", "build.ts"], { cwd: ROOT, stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  console.log(`[dev] build ${label} -> exit ${code}`);
}

let timer: Timer | null = null;
watch(path.join(ROOT, "src"), { recursive: true }, (_ev, file) => {
  if (!file || !/\.(ts|tsx)$/.test(file)) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void build(String(file)), 300);
});
for (const f of ["index.html", "product.html", "admin.html"]) {
  watch(path.join(ROOT, f), () => console.log(`[dev] ${f} changed (served live, no build needed)`));
}

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".json": "application/json",
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      return fetch(API_UPSTREAM + url.pathname + url.search, {
        method: req.method,
        headers: req.headers,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
      });
    }
    let rel = url.pathname === "/" ? "/index.html" : url.pathname;
    if (rel.startsWith("/app/")) rel = rel.slice(4) || "/index.html";
    const file = Bun.file(path.join(ROOT, rel));
    if (await file.exists()) {
      const ext = path.extname(rel);
      return new Response(file, { headers: { "content-type": MIME[ext] ?? "application/octet-stream" } });
    }
    return new Response("not found", { status: 404 });
  },
});

await build("initial");
console.log(`[dev] frontend on http://localhost:${PORT}/ (api -> ${API_UPSTREAM})`);
