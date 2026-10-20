/* package-bundle.ts - build the R2 bundle the SaaSTryon platform deploys
every shop from. One bundle, many shops: CI builds the shop once, this
script lays it out the way `deployer::bundle` expects and writes the
manifest.

   bundles/<bundle_id>/manifest.json
   bundles/<bundle_id>/shop.wasm          (the built wasm)
   bundles/<bundle_id>/worker.js          (the glue, importing ./shop.wasm)
   bundles/<bundle_id>/shop-schema.sql    (the per-shop D1 schema)
   bundles/<bundle_id>/assets/...          (the shop frontend)

Usage: bun scripts/package-bundle.ts <bundle_id> [out_dir]
*/
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const bundleId = process.argv[2];
if (!bundleId) {
  console.error("usage: bun scripts/package-bundle.ts <bundle_id> [out_dir]");
  process.exit(2);
}
const repoRoot = path.resolve(import.meta.dirname, "..");
const outDir = path.resolve(process.argv[3] ?? path.join(repoRoot, "bundle-out"));

/* The wasm-bindgen output of worker-build: the glue imports the wasm by
   file name, and the bundle wants it called shop.wasm. */
const glueSrc = path.join(repoRoot, "worker", "build", "index.js");
const wasmSrc = path.join(repoRoot, "worker", "build", "index_bg.wasm");
const frontendRoot = path.join(repoRoot, "frontend");
const schemaSrc = path.join(repoRoot, "worker", "build", "shop-schema.sql");

/* What a shop actually serves - and nothing else. The old version
   walked the whole frontend dir and shipped 69 files (markdown, build
   scripts, the TypeScript sources, lockfiles), which burned the API
   token's 1,200 req/5 min budget (B7). The shop needs the HTML
   shells, the two Workers files, the built js/css + the imgpipe wasm,
   and the pwa loader. */
const INCLUDE: Array<{ dir: string; match: (rel: string) => boolean }> = [
  { dir: ".", match: (rel) => /^(index|product|studio|dashboard)\.html$/.test(rel) },
  { dir: ".", match: (rel) => /^_(redirects|headers)$/.test(rel) },
  { dir: "dist", match: (rel) => /\.(js|css)$/.test(rel) },
  { dir: "dist/imgpipe", match: (rel) => /\.(js|wasm)$/.test(rel) },
  { dir: "pwa", match: (rel) => /\.js$/.test(rel) },
  { dir: "public/imgpipe", match: (rel) => /\.(js|wasm)$/.test(rel) },
];

for (const p of [glueSrc, wasmSrc, frontendRoot, schemaSrc]) {
  if (!existsSync(p)) {
    console.error(`missing bundle input: ${p}`);
    process.exit(2);
  }
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(path.join(outDir, "assets"), { recursive: true });

/* The glue: same module, but the wasm import points at our name. */
const glue = readFileSync(glueSrc, "utf8").replace("./index_bg.wasm", "./shop.wasm");
writeFileSync(path.join(outDir, "worker.js"), glue);
cpSync(wasmSrc, path.join(outDir, "shop.wasm"));
cpSync(schemaSrc, path.join(outDir, "shop-schema.sql"));

const sha256 = (file: string): string =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

/* The frontend: only the included files become assets, each with its
   URL path (the shop serves them from the assets binding). */
const assets: Array<{ key: string; path: string; sha256: string }> = [];
const seen = new Set<string>();
for (const { dir, match } of INCLUDE) {
  const base = path.join(frontendRoot, dir);
  if (!existsSync(base)) continue;
  /* The asset path mirrors the file's place in the wrangler assets dir
     (./frontend): dist/main.js is served at /dist/main.js, and the shop
     asks for /app/dist/main.js (the _redirects rewrite). */
  const root = dir === "." ? "" : dir;
  const walk = (full: string, rel: string): void => {
    for (const name of readdirSync(full).sort()) {
      const child = path.join(full, name);
      const childRel = rel ? `${rel}/${name}` : name;
      if (statSync(child).isDirectory()) {
        walk(child, childRel);
        continue;
      }
      if (!match(childRel) || seen.has(childRel)) continue;
      seen.add(childRel);
      const dest = path.join(outDir, "assets", childRel);
      mkdirSync(path.dirname(dest), { recursive: true });
      cpSync(child, dest);
      assets.push({ key: `assets/${childRel}`, path: `/${childRel}`, sha256: sha256(child) });
    }
  };
  walk(base, root);
}

const manifest = {
  schema: "st-bundle/1",
  wasm: { key: "shop.wasm", sha256: sha256(path.join(outDir, "shop.wasm")) },
  glue: { key: "worker.js" },
  schema_sql: { key: "shop-schema.sql" },
  assets,
  entry: "worker.js",
  compat_date: "2026-10-19",
};
writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`bundle ${bundleId}: ${assets.length} assets, manifest at ${outDir}/manifest.json`);
