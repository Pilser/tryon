# ARCHITECTURE — tryon virtual try-on e-commerce

## 0. Status

- CI has NOT been triggered. No remote, no tag pushed. `release.yml` is release-only (no check/test).
- Landing page is currently a placeholder. This doc defines the target shop build.
- Prior code hallucinated Leptos 0.6 SSR APIs that do not compile. This doc pins the correct approach.

## 1. Goal

Premium e-commerce shop where:
- Owner uploads products (photo + title + price + category + sizes) in `/admin`.
- Product images go to Cloudflare R2 (`tryon-products` bucket). Metadata goes to D1 (`products` table) with R2 key + public URL.
- Shoppers land on `/`, see premium grid with search + category/size/price filters, click product for detail.
- Each card has: `Try On` (Genlook) + `Inquire` (opens WhatsApp with owner number + product ref).
- Try-on flow proxies Genlook API via Worker so API key never hits browser.

## 2. Stack

- Edge: Cloudflare Workers (Rust -> Wasm via `worker` crate). No Node server.
- UI: Leptos (Wasm in browser) + SSR HTML from Worker for SEO/first paint + hydration.
- API provider: Genlook Try-On API. 3 calls: `POST /images/upload` -> `POST /try-on` -> `GET /generations/:id` (poll or webhook).
- Storage: R2 for product/person images, D1 for products + shop settings (owner WhatsApp, shop name, currency).
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

- `GET /` -> SSR landing (grid, filters as static + hydrated).
- `GET /product/:id` -> SSR detail.
- `GET /admin` -> SSR admin shell (auth-gated later, open for v1).
- `GET /api/products?q=&category=&size=&max_price=` -> JSON list from D1.
- `GET /api/products/:id` -> JSON single.
- `POST /api/admin/products` (multipart: image + fields) -> store to R2, insert D1, return Product.
- `POST /api/try-on` -> validates product_id + person_image_id, calls Genlook `POST /try-on` with server key, returns generationId.
- `GET /api/generations/:id` -> proxies Genlook poll.
- `GET /api/shop-settings` -> public shop name + WhatsApp + currency.
- `GET /healthz` -> ok.

Secrets (wrangler): `GENLOOK_API_KEY`, `ADMIN_TOKEN` (v1: simple bearer for /api/admin/*).
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
    whatsapp.rs (wa.me builder, pure fn + tests)
    filter.rs (apply_filter pure fn + tests)
  client/src/
    main.rs (mount only)
    app.rs (router: / , /product/:id, /admin)
    pages/
      mod.rs
      landing/page.rs (hero + search + grid)
      product_detail/page.rs
      admin/page.rs (upload + list)
    components/
      mod.rs
      layout/mod.rs (header, footer)
      product/mod.rs (card, grid)
      filters/mod.rs (search_bar, filters)
      tryon/mod.rs (button, modal)
      inquire/mod.rs (whatsapp_button)
      admin/mod.rs (upload_form, product_row)
    styles/main.css (premium theme)
  worker/src/
    lib.rs (re-export only)
    main.rs (fetch router only)
    routes/mod.rs + products.rs + admin.rs + tryon.rs + shop.rs + health.rs
    store.rs (D1+R2 abstraction, testable without bindings)
    genlook.rs (REST client, key from env, testable with mock base_url)
    ssr.rs (landing/detail/admin render helpers)
```

Rules: one domain per file, <=500 hard / <=300 target. `mod.rs` re-export only.

## 7. Phases

- phase0: docs + whitelist gitignore + wrangler.toml + release.yml fix (this doc).
- phase1: shared models + whatsapp + filter (+ tests).
- phase2: worker store + genlook + routes (+ tests, no real network).
- phase3: worker ssr + fetch router.
- phase4: client layout + product + filters + landing page (premium CSS).
- phase5: client tryon modal + inquire + product_detail.
- phase6: client admin upload + list, wired to POST /api/admin/products.
- phase7: R2+D1 wiring in wrangler + end-to-end `wrangler dev` manual test.
- phase8 (integration, needs approval): full-workspace check/test + tag `v*` to trigger CI release build.

Each phase ends with: `cargo fmt`, `ram-check -p <crate>`, `ram-test -p <crate>`, `check-bloat --max 500`. One phase = one commit `phase<N>: <crate> - <what>`.

## 8. Premium landing requirements

- Hero: shop name, value prop, CTA scroll to grid. No generic template look.
- Sticky filter bar: search input (debounced), category pills, size select, max-price slider, result count, clear-all.
- Grid: responsive cards with image (R2 URL, lazy), title, price, category badge, hover lift, `Try On` (primary) + `WhatsApp` (outline with icon).
- Empty state + skeleton loaders. All client filtering is pure fn in shared/filter.rs so SSR and Wasm agree.
- CSS: dark-premium, CSS variables, no framework dependency for v1.

## 9. Admin requirements

- `/admin`: shop settings display (WhatsApp number), upload form (file + title + price + category + sizes + description), client-side preview, progress state.
- Product table with thumbnail, delete (v2), copy image URL.
- Upload flow: `POST /api/admin/products` multipart -> Worker streams to R2 `products/<uuid>.<ext>`, inserts D1 row, returns JSON. No direct R2 credentials in browser.

## 10. Genlook integration notes

- Key stays in Worker secret. Browser sends only `product_id` + `person_image_id`.
- Person photo upload: `POST /api/person-upload` -> Worker forwards to Genlook `/images/upload`, returns imageId (reuse per session).
- Poll: client polls `GET /api/generations/:id` every 2s up to ~30s, or Worker can accept webhook (v2).
- Failed try-ons refunded by Genlook; Worker surfaces `generation.failed` as JSON error with code.
