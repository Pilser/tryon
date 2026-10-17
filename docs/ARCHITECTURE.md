# ARCHITECTURE — tryon virtual try-on e-commerce

## 0. Status

- CI has NOT been triggered. No remote, no tag pushed. `release.yml` is release-only (no check/test).
- Landing page is currently a placeholder. This doc defines the target shop build.
- Prior code hallucinated Leptos 0.6 SSR APIs that do not compile. This doc pins the correct approach.

## 1. Goal

Premium e-commerce shop where:
- Owner uploads products (photo + title + price + category + sizes) in `/studio`.
- Product images go to Cloudflare R2 (`tryon-products` bucket). Metadata goes to D1 (`products` table) with R2 key + public URL.
- Shoppers land on `/`, see premium grid with search + category/size/price filters, click product for detail.
- Each card has: `Try On` (Genlook) + `Inquire` (opens WhatsApp with owner number + product ref).
- Try-on flow proxies Genlook API via Worker so API key never hits browser.

## 2. Stack

- Edge: Cloudflare Workers (Rust -> Wasm via `worker` crate). No Node server.
- UI: Leptos (Wasm in browser) + SSR HTML from Worker for SEO/first paint + hydration.
- API provider: Genlook Try-On API. 3 calls: `POST /images/upload` -> `POST /try-on` -> `GET /generations/:id` (poll or webhook).
- Storage: R2 for product/person images, D1 for products + shop settings (owner WhatsApp, shop name, currency).
- Delivery: one Worker + Workers static assets (`[assets]` in `wrangler.toml`). `/app/*` is served from the edge via `frontend/_redirects` (200 proxy) and never invokes the Worker; `/`, `/product/:id`, `/studio`, `/healthz`, `/api/*` are `run_worker_first`. Cache policy + deploy steps: `docs/DEPLOY.md`.
- Build: local = `ram-check.sh` + `ram-test.sh` + `check-bloat.sh` only. Binaries = CI `release.yml` only.

## 3. SSR in Workers (what it is)

1. Request `GET /` or `/product/:id` hits Worker.
2. Worker reads D1/R2 (product list or single product) + shop settings.
3. Worker calls `leptos::ssr::render_to_string` to produce full HTML with product cards, OG tags, price schema.
4. Browser receives HTML (SEO + fast FCP), then instantiates same Leptos Wasm bundle to hydrate: search input, filters, try-on modal become interactive.
5. Subsequent interactions (`/api/*`) are JSON fetch to Worker, not full page loads.

Why: search engines see real HTML, WhatsApp link previews work, first paint <1s, then SPA behaviour.

## 4. Data model (`shared`)

```rust
Product { id, title, description, price, currency, image_url, r2_key, category, sizes[], created_at }
ShopSettings { shop_name, owner_whatsapp (E.164, no +), currency, logo_url }
ProductFilter { query, category, size, max_price }
TryOnRequest { product_id, person_image_id }
TryOnResponse { generation_id, status }
GenerationStatus { generation_id, status, result_image_url? }
```

WhatsApp inquire URL (built client-side, no secret):
`https://wa.me/<owner_whatsapp>?text=<urlencoded "Hi <shop>! I like <title> (<id>) <url>">`

## 5. Worker API surface

The worker renders nothing: every page lives in `frontend/` (static), and the
worker either redirects to it or answers JSON.

Pages (302 to the frontend):
- `GET /` -> `/app/`, `GET /product/:id` -> `/app/product.html?id=…`,
  `GET /studio` -> `/app/studio.html?owner=1`.

Public JSON:
- `GET /api/products?q=&category=&size=&max_price=` -> D1 rows, `PRODUCTS_JSON` seed fallback (local dev).
- `GET /api/products/:id` -> single product.
- `GET /api/categories` -> owner-managed categories (id, title, icon url).
- `GET /api/shop-settings` -> shop name + WhatsApp + currency + logo.
- `GET /healthz` -> `{"ok":true}`.

Prices / currency:
- `price_cents` is always 1/100 of the major unit, for every currency, so
  the wire format never changes. The owner form shows/accepts major units
  (`12000`, `19.99`) and `frontend/src/core/format.ts::toMinor` converts once.
- Supported codes + display decimals live in `shared/src/currency.rs`
  (mirrored in `frontend/src/core/currencies.ts`, same order). Unknown
  codes normalize to the shop currency. UGX is the default and first.
- Shop currency comes from `SHOP_CURRENCY` (default `UGX`), overridden by
  the owner shop card (`POST /api/studio/shop` field `currency`); each
  bundle carries its own `currency` field, defaulted to the shop one.

Try-on (worker is the only caller of Genlook; key never reaches the browser):
- `POST /api/person-upload` -> precheck (multipart, <=10 MB, image mime), then the
  raw body is forwarded to Genlook `POST /images/upload` -> `{imageId}`.
- `POST /api/try-on/sync` and `POST /api/try-on` -> build the Genlook body
  (`products[0]` + `person.image.source.id`), forwarded to `POST /try-on[/sync]`.
  200 = COMPLETED + temporary `resultImageUrl`, 202 = PENDING (poll).
  The body also carries `device_id`: the allowance is checked first
  (`routes/quota.rs::gate`), and only a generation Genlook accepted is
  recorded (`record`), so a blocked device never spends a credit.
- `GET /api/generations/:id` -> proxies the Genlook poll.

Devices / free try-ons / unlock codes:
- `POST /api/device` -> register this browser (`{id, fingerprint}`) or restore
  the id already known for that fingerprint; answers the allowance snapshot.
- `POST /api/device/contact` -> `{device_id, name, whatsapp}` from the quota
  banner (the durable identity: survives any browser change).
- `POST /api/device/redeem` -> `{device_id, code}` where `code` is a
  4-character unlock code; a code pays once (`TOKEN_USED` 409 for another
  device), re-redeeming on the same device is a no-op.
- Counters live in D1 only (`routes/device.rs` DDL): `used` = `COUNT(*)` of
  the `tryons` log, `bonus` = unused redeemed try-ons, `bonus_until_ms` = end
  of a time token's unlimited window. Nothing the browser can edit raises the
  quota. With no D1 binding (local rig) the gate stays permissive.

Owner dashboard (`routes/usage.rs`, `routes/tokens.rs`, `routes/quota.rs`):
- `GET /api/studio/usage` -> one payload for the whole dashboard: totals +
  `devices[]` (name, WhatsApp, tries, first/last seen) + `tokens[]`.
- `POST /api/studio/tokens` -> `{kind:"count"|"time", value, count, note}`
  mints 1..50 codes (alphabet without look-alikes, e.g. `BKWY`).
- `POST /api/studio/tokens/delete` -> `{code}` (used or not).
- `POST /api/studio/settings` -> `{free_tries}` for every new device.
- `POST /api/studio/devices/block` -> `{device_id, blocked}` blocks a device
  (wrong number, unpaid usage) or unblocks it; the try-on gate answers
  `403 BLOCKED` for a blocked device before anything else.
- `POST /api/studio/tokens/cancel` -> pull an UNUSED code (`{code}`): the
  row stays with `canceled=1` (audit) but redemption answers
  `409 TOKEN_USED`. Canceled codes list with the used ones and are
  deletable.
- `POST /api/studio/tokens/purge` -> `{filter:"used"|"canceled"|"both"}`
  bulk-deletes spent codes.
- `GET /api/studio/credits` -> forwards Genlook `GET /account/credits`
  (`{creditBalance}`). Generation responses carry no per-call cost field:
  a try-on is a flat 1 credit, refunded when it fails, so the balance
  endpoint is the only spend signal the API offers.
- Owner-only (Bearer `OWNER_TOKEN`; empty token = open local backend):
- `POST /api/owner/login` / `POST /api/owner/logout`.
- `POST /api/studio/products` (multipart bundle: image0 garment, image1 model, image2 styled) -> R2 + D1 upsert.
- `POST /api/studio/categories` (multipart: title + icon) -> R2 + D1 upsert.
- `POST /api/studio/shop` (multipart: shop_name + logo) -> R2 + D1 upsert.
- `GET /api/owner/…` none yet: reads are public, writes are gated.

Frontend side of the allowance (`frontend/src/core/device.ts`,
`components/quota.ts`, `components/dashboard.ts`): the browser keeps a device
id in `localStorage` and sends it on `/api/device` and every try-on. A spend
(`remaining === 0`) shows the studio banner: a one-line bar that expands to
collect the number and take the code, so the studio still fits the phone
screen. The owner opens the same data with the dashboard (Overview / Users /
Unlock codes / Settings): tiles, per-device rows, minted codes with copy +
delete for used ones, CSV export and a printable code sheet.

Errors: every failure answers Genlook's shape `{code,message,status}` with the
matching HTTP status — client mistakes are `400`/`401`, never a bare `500`
(`routes/errors.rs`). The frontend has exactly one parser (`core/api.ts`).
Upstream Genlook errors keep their own `code` (e.g. `INSUFFICIENT_CREDITS`,
`IMAGE_NOT_FOUND`) so the studio can show the real reason.

Secrets (wrangler): `GENLOOK_API_KEY`, `OWNER_TOKEN` (v1: simple bearer for /api/studio/*).
Bindings: `R2 tryon-products`, `D1 tryon-db`.

## 6. Folder structure (attainable, no bloat)

```
tryon/
  docs/ARCHITECTURE.md
  wrangler.toml
  Cargo.toml (workspace: client, worker, shared)
  scripts/ram-check.sh, ram-test.sh, check-bloat.sh
  .github/workflows/release.yml (release only)
  shared/src/
    mod.rs (re-export only)
    models.rs (Product, ShopSettings, filters)
    photo.rs (MAX_BYTES/MIMEs/dims/share_url + tests)
    whatsapp.rs (wa.me builder + wa share, pure fn + tests)
    filter.rs (apply_filter pure fn + tests)
  client/src/
    main.rs (mount only)
    app.rs (router: / , /product/:id, /studio)
    pages/
      mod.rs
      landing/page.rs (hero + search + grid)
      product_detail/page.rs
      studio/page.rs (upload + list)
    components/
      mod.rs
      layout/mod.rs (header, footer)
      product/mod.rs (card, grid)
      filters/mod.rs (search_bar, filters)
      tryon/mod.rs + studio.rs (persistent studio: pick/review/working/done, download)
      inquire/mod.rs (whatsapp_button, share_buttons)
      studio/mod.rs (upload_form with WASM photo pipe + preview)
    photo/pipe.rs (WASM validate + downscale + JPEG encode + preview URL)
    styles/main.css (premium theme)
  worker/src/
    lib.rs (routing table only; UI is static, this serves redirects + JSON)
    routes/ (one domain per file)
      mod.rs (module list)
      products.rs (list/get, D1 rows with PRODUCTS_JSON seed fallback)
      categories.rs + shop.rs (owner catalogue + branding writes)
      studio.rs (bundle upload: R2 keys, form parse, D1 upsert)
      tryon.rs (sync body + response parse) + person.rs (upload precheck)
      owner.rs (login/logout/token) + ids.rs (row ids) + health.rs
      genlook_api.rs (base URL + x-api-key + one forwarding helper)
    store.rs (D1+R2 abstraction, testable without bindings)
    genlook.rs (REST client, key from env, testable with mock base_url)
```

Rules: one domain per file, <=500 hard / <=300 target. `mod.rs` re-export only.

## 7. Phases

- phase0: docs + whitelist gitignore + wrangler.toml + release.yml fix (this doc).
- phase1: shared models + whatsapp + filter (+ tests).
- phase2: worker store + genlook + routes (+ tests, no real network).
- phase3: worker ssr + fetch router.
- phase4: client layout + product + filters + landing page (premium CSS).
- phase5: client tryon modal + inquire + product_detail.
- phase6: client studio upload + list, wired to POST /api/studio/products.
- phase7: R2+D1 wiring in wrangler + end-to-end `wrangler dev` manual test.
- phase8 (integration, needs approval): full-workspace check/test + tag `v*` to trigger CI release build.

Each phase ends with: `cargo fmt`, `ram-check -p <crate>`, `ram-test -p <crate>`, `check-bloat --max 500`. One phase = one commit `phase<N>: <crate> - <what>`.

## 8. Premium landing requirements

- Hero: shop name, value prop, CTA scroll to grid. No generic template look.
- Sticky filter bar: search input (debounced), category pills, size select, max-price slider, result count, clear-all.
- Grid: responsive cards with image (R2 URL, lazy), title, price, category badge, hover lift, `Try On` (primary) + `WhatsApp` (outline with icon).
- Empty state + skeleton loaders. All client filtering is pure fn in shared/filter.rs so SSR and Wasm agree.
- CSS: dark-premium, CSS variables, no framework dependency for v1.

## 9. Studio owner requirements

- `/studio`: shop settings display (WhatsApp number), upload form (file + title + price + category + sizes + description), client-side preview, progress state.
- Product table with thumbnail, delete (v2), copy image URL.
- Upload flow: `POST /api/studio/products` multipart -> Worker streams to R2 `products/<uuid>.<ext>`, inserts D1 row, returns JSON. No direct R2 credentials in browser.

## 10. Genlook integration notes (verified against docs + example app)

- Base `https://api.genlook.app/tryon/v1`, auth `x-api-key: gk_...` (Worker secret only).
- Person upload: `POST /images/upload` multipart `file` (+ optional `crop` default true, `externalUserId`, `keepForDays` 1/3/7). Returns `imageId` (opaque, TTL in name e.g. `ttl-7d`, default 7 days) + short-lived `imageUrl`. Accepted: JPEG/PNG/WebP/HEIC, 10 MB max. Reuse one `imageId` per session.
- Try-on: `POST /try-on/sync` (same body as async) waits up to 90 s: 200 = COMPLETED + temporary `resultImageUrl` (download at once or refetch generation for fresh URL), 202 = poll `GET /generations/:id`. Products 1–4 per call; inline shape `{externalId,title,description,images}` cached 15 days, reference `{externalId}` reuses analysis (faster), one-shot 7 days. First try-on of a product is slower (analysis); `POST /products` pre-register is v2.
- Example app pattern mirrored: upload once -> try-on sync with `externalId` + `imageId`; browser talks only to our Worker routes; mock-engine toggle is v2.
- Costs 1 credit/try-on, refunded on failure. Poll every 2 s, cap ~90 s.
- Base URL is `GENLOOK_BASE`-overridable (`routes/genlook_api.rs`), default
  production: local dev points it at `mock-genlook/` (stdlib Python, returns the
  person photo unchanged after a configurable delay). See `mock-genlook/README.md`
  for the endpoint table, failure drills (`PRODUCT_NOT_FOUND`,
  `INSUFFICIENT_CREDITS`, `FAILED`) and the two wiring options.
- What the mock + vendored example changed in our plan: error bodies keep
  Genlook's `{code,message,status}` (we now emit the same shape — see §5); the
  example's poll loop is unbounded `while(true)` while ours stops at 90 s;
  optional v2 win is their reference-first `{externalId}` payload with an inline
  fallback on `PRODUCT_NOT_FOUND` (one call today, always correct).

## 11. Try-on studio (solid, persistent)

- Embedded `<section class="studio">` on the product page — NOT a dismissible popup. No overlay-click close, no Esc close. Explicit buttons only.
- Steps: Pick (choose file + take-photo `capture="user"` inputs) -> Review (preview + dims/size note + Start/Change) -> Working (progress text) -> Done (result + Download + Try again + Change photo) / Failed (error + Retry).
- Client gate before submit (`shared::photo` + `client/src/photo/pipe.rs` WASM): 10 MB, mime allowlist, min 256px; hi-res downscaled to 1600px edge + JPEG q85; HEIC passes through (Genlook-native).
- Download: fetch result URL -> Blob -> `a[download]` click. Result URLs are temporary — UI tells user to download now.

## 12. Share / bots

- Share URL = Worker SSR product URL (`shared::photo::share_url`). `render_detail` emits absolute `og:title/description/image/url` + `twitter:card summary_large_image` + canonical, so WhatsApp/Twitter bots get full preview with zero JS.
- `ShareButtons` component: readonly link field + WhatsApp share (`wa.me/?text=`).
