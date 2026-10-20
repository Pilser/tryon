# Deploy

How to ship a change. Cloudflare is driven by **REST API only** (no wrangler).
Every command below runs from the repo root.

## 0. Facts

| Thing | Value |
|---|---|
| Account id | `499e8080f5fe32106d9043044fea6f72` |
| Zone `latiforge.com` | `32471b3b5cb0bb23bddd0e7eb9e1f5f1` |
| Platform script | `tryon-platform` (workers.dev off) |
| Platform URL | `https://latiforge.com` (apex, custom domain) |
| Shop URL | `https://{sub}.latiforge.com` |
| Platform D1 | `tryon-platform-db` = `dff2b97c-3051-42db-b3f7-72b51823952b` |
| Bundle R2 | `tryon-bundles` (key `bundles/<bundle_id>/…`) |
| Shop image R2 | `tenant-images` |
| Token | `CLOUDFLARE_API_TOKEN` in the repo-root `.env` (gitignored) |
| Token budget | 1,200 req / 5 min - one R2 object put = one request |

`.env` (gitignored) holds `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
`CF_WORKERS_DEV_SUBDOMAIN`. Load it with:

```bash
set -a; . .env; set +a
```

## 1. CI builds the binaries (never build locally)

The release workflow (`.github/workflows/release.yml`) runs on a `v*` tag or a
manual dispatch. It produces:

| Artifact | Content |
|---|---|
| `tryon-platform-<tag>` | `build/index.js` (glue) + `build/index_bg.wasm` + `frontend/dist/` |
| `tryon-bundle-<tag>` | `manifest.json`, `shop.wasm`, `worker.js`, `shop-schema.sql`, `assets/` |
| `tryon-worker-<tag>`, `tryon-imgpipe-<tag>`, `tryon-frontend-<tag>` | the plain shop bits |

```bash
git push origin master
git tag v0.9.99 && git push origin v0.9.99      # triggers the workflow
```

Download an artifact (needs a GitHub token with `repo` scope):

```bash
curl -sL -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/Pilser/tryon/actions/artifacts/<id>/zip" -o art.zip
unzip -q art.zip -d artifact
```

## 2. Deploy the platform (API)

```bash
set -a; . .env; set +a
export PLATFORM_DB_ID=dff2b97c-3051-42db-b3f7-72b51823952b
export PLATFORM_ZONE_ID=32471b3b5cb0bb23bddd0e7eb9e1f5f1
bun scripts/deploy-platform.ts artifact          # artifact = unpacked tryon-platform-<tag>
```

The script does, in order:

1. `POST /accounts/{id}/workers/scripts/tryon-platform/assets-upload-session`
   with `{"manifest": {"/path": {"hash","size"}}}` -> `{jwt, buckets}`
2. `POST /accounts/{id}/workers/assets/upload?base64=true` - one request per
   bucket, part name = hash, part body = **base64** of the file
3. `PUT /accounts/{id}/workers/scripts/tryon-platform` - multipart:
   `metadata` (main_module, bindings, `assets.jwt`) + `index.js`
   (`application/javascript+module`) + `index_bg.wasm` (`application/wasm`)
4. `PUT /accounts/{id}/workers/scripts/tryon-platform/secrets` for every
   `PLATFORM_SECRET_<NAME>=value` in the environment
5. `PUT /accounts/{id}/workers/domains` for the apex

Secrets the platform needs (all `secret_text`):

```
ADMIN_TOKEN            bearer for /api/v1/admin/*  (fail-closed when unset)
CLOUDFLARE_API_TOKEN   the platform's own deploy token
CF_ACCOUNT_ID          the account id
CF_ZONE_ID             the zone for {sub}.latiforge.com
CF_ZONE_NAME           latiforge.com
CF_WORKERS_DEV_SUBDOMAIN   fallback subdomain (optional)
BUNDLE_ID              the bundle the platform deploys shops from
GENLOOK_API_KEY        the Genlook key (live try-on)
```

## 3. The shop bundle (built once, used by every shop)

CI builds it: `worker-build` -> `build/index.js` + `build/index_bg.wasm`,
`bun scripts/package-bundle.ts <tag>` lays it out, then the workflow puts
every object into R2 under `bundles/<tag>/`.

Bundle layout (this is what the platform reads):

```
bundles/<id>/manifest.json     {"schema":"st-bundle/1","wasm":{"key","sha256"},
                                 "glue":{"key"},"schema_sql":{"key"},
                                 "assets":[{"key","path","sha256"}],
                                 "entry","compat_date"}
bundles/<id>/shop.wasm         the shop wasm
bundles/<id>/worker.js         the glue (imports ./shop.wasm)
bundles/<id>/shop-schema.sql   the per-shop D1 schema (CREATE only, no ALTERs)
bundles/<id>/assets/…          the shop frontend (paths mirror frontend/)
```

Manual upload (the REST API has **no** R2 object endpoint - use wrangler or
the R2 S3 keys):

```bash
P="tryon-bundles/bundles/$TAG"
for f in manifest.json shop.wasm worker.js shop-schema.sql; do
  bunx wrangler@4 r2 object put "$P/$f" --file "bundle-out/$f" --remote
done
cd bundle-out/assets
find . -type f | sed 's|^\./||' | xargs -P 4 -I{} \
  bunx wrangler@4 r2 object put "$P/assets/{}" --file "{}" --remote
```

Then point the platform at it: `PLATFORM_SECRET_BUNDLE_ID=$TAG` in the
deploy run (step 2) - that is the only place a bundle id is set.

Keep the bundle small: ~26 files. Every file is one API request and the
token budget is 1,200 req / 5 min.

## 4. Deploy a shop (the platform does it - no CF creds for the user)

```bash
API=https://latiforge.com/api/v1
TOKEN=plat_…            # from admin/approve
SESSION=$(curl -s -X POST "$API/login" -H 'content-type: application/json' \
  --data "{\"token\":\"$TOKEN\"}" | jq -r .session_id)

curl -s -X POST "$API/deploy" -H "authorization: Bearer $SESSION" \
  -H 'content-type: application/json' --data '{"subdomain":"my-shop"}'
# -> {"ok":true,"shop_id":"shop_…","url":"https://my-shop.latiforge.com"}
```

What the platform does for that one call:

1. per-shop D1 + the bundle schema
2. `assets-upload-session` -> asset upload -> script PUT (script name
   `shop-<id8>`, bindings DB/PRODUCTS/SHOP_ID/PLATFORM_TOKEN/ASSETS)
3. `PUT /accounts/{id}/workers/domains` -> `{sub}.latiforge.com`

No CI, no local build per shop. The allowance gate returns 402 when the
owner is out of deploys (admin sets it: `POST /api/v1/admin/allowance`).

## 4b. Phase G: the shop's own domain, landing page and feed

All three are **owner-authenticated** (`Bearer <session_id>` from
`POST /api/v1/login`) and touch one shop only.

**Their own domain (free path, no Cloudflare for SaaS):**

```bash
curl -s -X POST https://latiforge.com/api/v1/shop/domain \
  -H "authorization: Bearer $SESSION" -H 'content-type: application/json' \
  --data '{"domain":"myshop.com"}'
```

The customer adds this Cloudflare account as a **collaborator** on the
zone that owns the domain (free plan). The platform looks the zone up,
refuses anything that is not in our account (`409 ZONE_NOT_OURS`), and
attaches the hostname with `PUT /accounts/{id}/workers/domains` - DNS
and the certificate are created by Cloudflare.

**Landing page at the root (the shop stays at `/app`):**

```bash
# one file at a time, the path is its place in the dist
curl -s -X POST "https://latiforge.com/api/v1/shop/landing/file?path=%2Findex.html&shop_id=$SHOP_ID" \
  -H "authorization: Bearer $SESSION" -F "file=@dist/index.html"

# publish: app assets (bundle) + landing files -> one asset set
curl -s -X POST https://latiforge.com/api/v1/shop/landing/apply \
  -H "authorization: Bearer $SESSION" -H 'content-type: application/json' \
  --data "{\"shop_id\":\"$SHOP_ID\"}"
```

The platform re-registers the shop script's assets with the bundle's app
assets (under `/app/…`) **plus** the landing files (at `/`), so the root
serves the customer's page and `/app/` serves the shop. Cloudflare only
transfers the files it does not have yet (`uploaded: 0` on a re-publish).

**The feed for the landing page (in the shop worker):**

```
GET /api/feed   ->  {shop:{name,logo,url,studio}, items:[{id,title,price_cents,
                    currency,image,url,category,sizes}]}
```

`url` is the shop's product page (`/product/<id>`), so a static landing
page lists cards that link straight into the shop. CORS is open
(`access-control-allow-origin: *`) and the answer is cacheable
(`max-age=60, s-maxage=300`), so the page can be served from anywhere:

```html
<script>
fetch("/api/feed").then(r => r.json()).then(f => {
  document.querySelector("#grid").innerHTML = f.items.map(i =>
    `<a class="card" href="${i.url}">${i.title} — ${i.price_cents / 100} ${i.currency}</a>`
  ).join("");
});
</script>
```



```bash
curl -s https://latiforge.com/api/v1/health          # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" https://{sub}.latiforge.com/app/
curl -s -o /dev/null -w "%{http_code}\n" https://{sub}.latiforge.com/healthz
```

## 6. Gotchas (each one cost a deploy - see PLATFORM.md §10)

- D1 `exec()` splits on `;`: migrate with one prepared statement per call,
  no trailing `;`.
- Asset hash = `sha256(base64(content) + extension)[:32]`, not sha256(bytes).
- Manifest keys are URL paths (`/dist/main.js`), and the path must mirror
  the wrangler assets dir.
- A Workers script does not apply the plain shop's `_redirects`: the bundle
  ships every file under both `/x` and `/app/x`.
- Every CF call is account-scoped: `/workers/domains` without the account
  id is error 7000.
- The account's workers.dev subdomain cannot be renamed by the API
  (10036) - the dashboard can ("Workers & Pages" -> Change).
- The main module part needs `application/javascript+module`.
