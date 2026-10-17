# Deploy to Cloudflare

One Worker (`tryon-shop`) serves both halves:

| Path | Served by | Notes |
|---|---|---|
| `/` `/product/:id` `/studio` `/healthz` `/api/*` | Worker (Rust → Wasm) | `run_worker_first` in `wrangler.toml` |
| `/app/*` (pages + `dist/*`) | Workers static assets | edge cache, **no Worker invocation** |

`frontend/_redirects` maps `/app/<x>` → `/<x>` with a 200 proxy, so the
files live at the root of `frontend/` while the URLs keep the `/app/` prefix.

## One-time setup

```bash
wrangler login
wrangler d1 create tryon-db          # paste database_id into wrangler.toml
wrangler r2 bucket create tryon-products

wrangler secret put GENLOOK_API_KEY  # from genlook.app
wrangler secret put OWNER_TOKEN      # owner login; empty = open local backend
wrangler secret put OWNER_WHATSAPP   # digits only, e.g. 256772000000

# optional vars (wrangler.toml [vars]): SHOP_NAME, SHOP_CURRENCY (default UGX),
# R2_PUBLIC_BASE (public bucket URL, e.g. https://pub-<hash>.r2.dev)
```

`R2_PUBLIC_BASE` must be publicly reachable: Genlook fetches product images
from it, so `/uploads` on localhost will not work for real try-ons.

## Deploy

`main` is `build/worker/shim.mjs`, which only `worker-build` produces. This
machine never runs `cargo build` (AGENTS.md §3), so shipping happens in CI:

1. Tag a release (`v0.9.6`) or run the `release` workflow manually.
2. CI builds the worker wasm + `worker-build` shim, types-checks and builds
   the client, and uploads artifacts.
3. When the repo has `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`
   secrets, the `deploy` job also runs `wrangler deploy`. Without the
   secrets, the run stops at artifacts (nothing breaks).

Optional: add a `CF_ZONE_ID` secret to purge the tagged edge cache after a
deploy.

## Caching

`frontend/_headers` sets the policy (Workers static assets, matched against
the request URL):

- `dist/chunk-*.js`, `dist/dist-*.js`, `dist/heic-to-*.js` (content-hashed)
  → `public, max-age=31536000, immutable`.
- `dist/main.js`, `dist/stylex.css`, `*.html` → `no-cache` + `ETag`, so a
  deploy is picked up on the next request while 304s stay cheap.
- Everything served as an asset carries `Cache-Tag: tryon-shop-static` for
  purge-by-tag (Cloudflare cache tags need an Enterprise zone; the header
  is ignored elsewhere, and Workers asset deployments purge their own old
  versions anyway).

Worker (JSON API) responses are never affected by `_headers`, so the try-on
routes keep their own CORS/cache behaviour.

## Schema notes

Tables are created idempotently on first write (`products`, `shop`,
`categories`). `shop.currency` and `shop.owner_whatsapp` were added later and
are applied as `ALTER TABLE` statements on the next owner save
(`SHOP_MIGRATIONS` in `worker/src/routes/shop.rs`), so an existing database
does not need a manual migration.
