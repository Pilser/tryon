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
const glueSrc = path.join(repoRoot, "build", "index.js");
const wasmSrc = path.join(repoRoot, "build", "index_bg.wasm");
const frontendDist = path.join(repoRoot, "frontend", "dist");
const schemaSrc = path.join(repoRoot, "build", "shop-schema.sql");

for (const p of [glueSrc, wasmSrc, frontendDist, schemaSrc]) {
  if (!existsSync(p)) {
    console.error(`missing bundle input: ${p}`);
    process.exit(1);
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

/* The frontend: every file becomes an asset with its URL path. */
const assets: Array<{ key: string; path: string; sha256: string }> = [];
const walk = (dir: string, prefix: string): void => {
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, `${prefix}${name}/`);
      continue;
    }
    const rel = `${prefix}${name}`;
    cpSync(full, path.join(outDir, "assets", rel));
    assets.push({ key: `assets/${rel}`, path: `/${rel}`, sha256: sha256(full) });
  }
};
walk(frontendDist, "");

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
