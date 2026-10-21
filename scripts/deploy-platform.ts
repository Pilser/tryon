/* deploy-platform.ts - deploy the SaaSTryon control plane to Cloudflare
   with the REST API only (no wrangler). Input: the CI artifact of the
   `platform` job (build/ = the wasm bundle, frontend/dist/ = the UI).

   bun scripts/deploy-platform.ts [artifact_dir]

   Flow (PLATFORM.md §10):
     1. POST /accounts/{id}/workers/scripts/{name}/assets-upload-session
        {"manifest": {"/path": {"hash","size"}}}  -> jwt + buckets
     2. POST /accounts/{id}/workers/assets/upload?base64=true
        parts named by hash, base64 content        -> completion jwt
     3. PUT  /accounts/{id}/workers/scripts/{name}
        multipart: metadata (main_module, bindings, assets.jwt)
                   + index.js (the glue) + index_bg.wasm (the module)
     4. PUT  /accounts/{id}/workers/scripts/{name}/secrets  (one per secret)

   Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, PLATFORM_DB_ID,
   PLATFORM_R2_BUCKET, PLATFORM_SCRIPT (default tryon-platform),
   PLATFORM_ZONE_ID (optional: attaches the apex custom domain). */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const API = "https://api.cloudflare.com/client/v4";
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const scriptName = process.env.PLATFORM_SCRIPT ?? "tryon-platform";
const dbId = process.env.PLATFORM_DB_ID;
const r2Bucket = process.env.PLATFORM_R2_BUCKET ?? "tryon-bundles";
const compatDate = process.env.PLATFORM_COMPAT_DATE ?? "2026-10-19";
const artifact = path.resolve(process.argv[2] ?? "artifact");
const distDir = path.join(artifact, "frontend", "dist");
const glueFile = path.join(artifact, "build", "index.js");
const wasmFile = path.join(artifact, "build", "index_bg.wasm");

if (!token || !account || !dbId) {
  console.error("need CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, PLATFORM_DB_ID");
  process.exit(2);
}
for (const p of [distDir, glueFile, wasmFile]) {
  if (!existsSync(p)) {
    console.error(`missing artifact piece: ${p}`);
    process.exit(2);
  }
}

const api = async (method: string, url: string, body?: unknown): Promise<any> => {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok || json.success === false) {
    const errs = JSON.stringify(json.errors ?? json);
    throw new Error(`${method} ${url} -> ${res.status} ${errs}`);
  }
  return json.result;
};

/* The Cloudflare asset hash: sha256(base64(content) + extension)[:32]. */
const assetHash = (rel: string, bytes: Buffer): string => {
  const name = rel.split("/").pop() ?? "";
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return createHash("sha256")
    .update(bytes.toString("base64") + ext)
    .digest("hex")
    .slice(0, 32);
};

/* 1. the manifest: every dist file under its URL path. */
const manifest: Record<string, { hash: string; size: number }> = {};
const files: Array<{ rel: string; bytes: Buffer }> = [];
const walk = (dir: string, prefix: string): void => {
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) {
      walk(full, rel);
      continue;
    }
    const bytes = readFileSync(full);
    files.push({ rel, bytes });
    manifest[`/${rel}`] = { hash: assetHash(rel, bytes), size: bytes.length };
  }
};
walk(distDir, "");
console.log(`manifest: ${Object.keys(manifest).length} assets`);

/* 2. the upload session. */
const session = await api(
  "POST",
  `/accounts/${account}/workers/scripts/${scriptName}/assets-upload-session`,
  { manifest },
);
console.log(`session jwt ok, ${session.buckets?.length ?? 0} bucket(s) to upload`);

/* 3. the files, one request per bucket, parts named by hash. The part
   body is the BASE64 of the file (the endpoint runs with ?base64=true)
   and the part's content type is the mime the file is served with. */
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};
const mimeOf = (rel: string): string => {
  const ext = (rel.split(".").pop() ?? "").toLowerCase();
  return MIME[`.${ext}`] ?? "application/octet-stream";
};
let completion = session.jwt;
for (const bucket of session.buckets ?? []) {
  const form = new FormData();
  for (const hash of bucket) {
    const file = files.find((f) => assetHash(f.rel, f.bytes) === hash);
    if (!file) throw new Error(`no file for hash ${hash}`);
    form.append(
      hash,
      new Blob([file.bytes.toString("base64")], { type: mimeOf(file.rel) }),
      file.rel,
    );
  }
  const res = await fetch(
    `${API}/accounts/${account}/workers/assets/upload?base64=true`,
    { method: "POST", headers: { authorization: `Bearer ${session.jwt}` }, body: form },
  );
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(`asset upload -> ${res.status} ${JSON.stringify(json.errors)}`);
  }
  if (json.result?.jwt) completion = json.result.jwt;
}
console.log("assets uploaded");

/* 4. the script PUT: metadata + the glue module + the wasm module. */
const metadata = {
  main_module: "index.js",
  compatibility_date: compatDate,
  bindings: [
    { type: "assets", name: "ASSETS" },
    { type: "d1", name: "PLATFORM_DB", id: dbId },
    { type: "r2_bucket", name: "BUNDLES", bucket_name: r2Bucket },
  ],
  assets: { jwt: completion },
};
const form = new FormData();
form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }), "metadata");
form.append("index.js", new Blob([readFileSync(glueFile)], { type: "application/javascript+module" }), "index.js");
form.append("index_bg.wasm", new Blob([readFileSync(wasmFile)], { type: "application/wasm" }), "index_bg.wasm");
const put = await fetch(`${API}/accounts/${account}/workers/scripts/${scriptName}`, {
  method: "PUT",
  headers: { authorization: `Bearer ${token}` },
  body: form,
});
const putJson = await put.json();
if (!put.ok || putJson.success === false) {
  throw new Error(`script PUT -> ${put.status} ${JSON.stringify(putJson.errors)}`);
}
console.log(`script ${scriptName} deployed, version ${putJson.result?.id ?? "?"}`);

/* 4b. the self-heal copy: the platform keeps its own script parts in
   R2 so it can re-deploy ITSELF (a fresh script version spawns fresh
   isolates - the cure for a poisoned one) from the admin console. */
for (const [name, file] of [
  ["index.js", glueFile],
  ["index_bg.wasm", wasmFile],
] as const) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${r2Bucket}/objects/platform%2Fself%2F${name}`,
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/octet-stream",
      },
      body: readFileSync(file),
    },
  );
  if (!r.ok) console.log(`self-heal copy of ${name} failed: ${r.status}`);
}
await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${r2Bucket}/objects/platform%2Fself%2Fmeta.json`,
  {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      script_name: scriptName,
      compat_date: compatDate,
      bindings: metadata.bindings,
    }),
  },
);
console.log("self-heal copy stored in R2 (platform/self/*)");

/* 5. secrets: PLATFORM_SECRET_x=y pairs, one PUT each. */
for (const pair of Object.entries(process.env)) {
  if (!pair[0].startsWith("PLATFORM_SECRET_")) continue;
  const name = pair[0].replace("PLATFORM_SECRET_", "");
  await api("PUT", `/accounts/${account}/workers/scripts/${scriptName}/secrets`, {
    name,
    text: pair[1],
    type: "secret_text",
  });
  console.log(`secret ${name} set`);
}

/* 6. optional: the apex custom domain. */
if (process.env.PLATFORM_ZONE_ID) {
  await api("PUT", `/accounts/${account}/workers/domains`, {
    zone_id: process.env.PLATFORM_ZONE_ID,
    hostname: process.env.PLATFORM_APEX ?? "latiforge.com",
    service: scriptName,
    environment: "production",
  });
  console.log("apex domain attached");
}
console.log("done");
