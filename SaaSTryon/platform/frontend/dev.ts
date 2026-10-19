/* dev.ts - `bun run dev`: rebuild on save + serve dist on :8812.
   /api/v1/* proxies to the local rig (`bun run rig`, :8822) so browser
   probing works without the platform worker. */
import { watch } from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(".", import.meta.url).pathname);
const PORT = 8812;
const API_UPSTREAM = process.env.API_UPSTREAM || "http://localhost:8822";
const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

let timer: Timer | null = null;
function build(label: string): void {
  const proc = Bun.spawn(["bun", "build.ts"], { cwd: ROOT, stdout: "inherit", stderr: "inherit" });
  void proc.exited.then((code) => console.log(`[dev] build ${label} -> exit ${code}`));
}
watch(path.join(ROOT, "src"), { recursive: true }, (_ev, file) => {
  if (!file || !/\.(ts|tsx|html)$/.test(file)) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => build(String(file)), 300);
});

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
    let rel = url.pathname === "/" ? "/signup.html" : url.pathname;
    if (rel.endsWith("/")) rel += "index.html";
    const file = Bun.file(path.join(ROOT, "dist", rel));
    if (!(await file.exists())) return new Response("not found", { status: 404 });
    return new Response(file, {
      headers: { "content-type": MIME[path.extname(rel)] || "application/octet-stream" },
    });
  },
});

build("initial");
console.log(`[dev] platform frontend on http://localhost:${PORT}/ (api -> ${API_UPSTREAM})`);
