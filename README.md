# Latiforge — SaaSTryon

A multi-tenant **virtual try-on platform** for garment shops, studios and
collections. Every shop gets its own Cloudflare Worker, its own hostname
(`{sub}.latiforge.com` or its own domain), its own database and its own
catalogue; the platform signs the owners up, deploys their shops, meters
the try-on credits and keeps the whole thing running from one control
plane.

- **Live:** <https://latiforge.com> — the control plane, the public landing page
  and the admin console.
- **A tenant shop:** `https://{sub}.latiforge.com` — the storefront, the studio
  and the product feed.
- **Two halves in one repo:** the *platform* (`SaaSTryon/`) and the *shop*
  (`worker/`, `frontend/`, `shared/`, `imgpipe/`).

---

## 1. The repository map

| Folder | What it is | Key files |
|---|---|---|
| `SaaSTryon/` | **The control plane** — the platform worker, its console and its docs | `platform/src/`, `platform/frontend/`, `docs/` |
| `worker/` | **The shop worker** — the Rust/Wasm worker every tenant shop runs | `src/lib.rs`, `src/routes/`, `src/store.rs` |
| `shared/` | The Rust crate both workers share (models, filters, photo rules) | `src/models.rs`, `src/filter.rs`, `src/photo.rs` |
| `imgpipe/` | The HEIC→JPEG wasm helper the studio uses in the browser | `src/lib.rs` |
| `frontend/` | **The shop's frontend** — the storefront, the studio and the owner dashboard | `src/pages/`, `src/core/`, `src/components/` |
| `scripts/` | The deploy and packaging tooling (API-only, no wrangler at runtime) | `deploy-platform.ts`, `package-bundle.ts`, `ram-check.sh` |
| `docs/` | The shop-side documentation (architecture, local run, studio spec, account layout) | `ARCHITECTURE.md`, `LOCAL_RUN.md`, `STUDIO_SPEC.md`, `ACCOUNTS.md` |
| `design/` | The Figcraft design system: tokens, the component proofs and the export scripts | `out/`, `proofs/`, `scripts/` |
| `mock-genlook/` | A local mock of the try-on provider, for development without credits | `server.py`, `bridge.py` |
| `_vendor/` | A read-only clone of a reference implementation — never edit | `virtual-try-on-api-example-main/` |
| `.github/workflows/` | The one CI pipeline (build → package → deploy) | `release.yml` |
| `.opencode/skills/` | The Figcraft skill the design work used | `figcraft-fusion/SKILL.md` |

### The platform — `SaaSTryon/`

```
SaaSTryon/
├── docs/                     the platform documentation (the reference set)
│   ├── PLATFORM.md           architecture, decisions, live findings (§10 = the traps)
│   ├── SHOP-API.md           every endpoint of both halves, with examples
│   ├── Deploy.md             how a release is shipped (CI → artifact → API deploy)
│   ├── DESIGN.md             the research-backed UX spec for the console + landing
│   └── PLAN-UX.md            the UX plan the spec came from
└── platform/
    ├── Cargo.toml            the platform crate (a workspace member)
    ├── migrations/           the platform D1 schema, one file per revision
    │   ├── 0001_init.sql     users, shops, hostnames, credits, audit
    │   ├── 0002_shop_tokens.sql   the 4-digit codes
    │   ├── 0004_shop_owner_token.sql  the per-shop studio token
    │   ├── 0005_shop_token_credits.sql  a code carries its value
    │   ├── 0006_platform_settings.sql  the try-on API key (set from the console)
    │   └── 0007_user_name_regno.sql    the person's name + registration number
    ├── src/                  the platform worker (Rust → Wasm)
    │   ├── lib.rs            the worker entry (fetch → http::route)
    │   ├── http.rs           the router: every /api/v1 path
    │   ├── auth.rs           signup, login, sessions, the owner's account
    │   ├── admin.rs          the admin queue: approve, allowance, suspend
    │   ├── shops.rs          the shops, their tokens and their credits
    │   ├── credits.rs        the manual billing gate (request → approve)
    │   ├── manage.rs         the control plane: bundles, redeploy, studio tokens
    │   ├── dashboard.rs      the admin and owner dashboard views
    │   ├── deploy.rs         the owner-facing deploy route
    │   ├── domain.rs         the custom domain attach
    │   ├── landing.rs        the shop's own landing page (upload + publish)
    │   ├── outbound.rs       the try-on API proxy (the key lives here)
    │   ├── store.rs          D1 access + the migrations
    │   └── deployer/         the deployer: the Cloudflare API, the bundle
    │       ├── mod.rs        the orchestration (script-PUT, D1, assets, domain)
    │       ├── provision.rs  the per-shop D1 + the schema
    │       ├── cf_api.rs     the Cloudflare REST client (retries, rate limits)
    │       └── bundle/       the bundle format: manifest, assets, multipart
    └── frontend/             the platform console (React + StyleX)
        ├── src/pages/        admin, home (owner), landing (public), login, signup
        ├── src/components/   admin/ owner/ landing/ shared/
        ├── src/assets/tryon/ the baked photos and the hero video (the manifest)
        ├── src/kit.ts        the design kit (u.*, pf.*, ld.* slots)
        └── src/api.ts        the ONE fetch boundary of this frontend
```

### The shop — `worker/`, `frontend/`, `shared/`, `imgpipe/`

```
worker/                        the shop worker (Rust → Wasm, one per tenant)
├── src/lib.rs                 the router: every /api path of a shop
├── src/routes/                one file per domain
│   ├── products.rs            the catalogue
│   ├── studio.rs              the owner's studio: products, categories, settings
│   ├── categories.rs          the categories
│   ├── media.rs               the R2 media route (the shop's own images)
│   ├── feed.rs                /api/feed — the public product feed (CORS open)
│   ├── device.rs              the shopper's device + the try-on usage
│   ├── tryon.rs               the try-on flow
│   ├── genlook_api.rs         the try-on provider client
│   ├── platform.rs            the shop → platform calls (redeem, credits)
│   ├── photos.rs              the backed-up shopper photos
│   ├── quota.rs tokens.rs     the unlock codes of a shop
│   ├── owner.rs shop.rs       the owner gate + the shop settings
│   └── errors.rs ids.rs       the error envelope + the id minting
├── src/store.rs               the D1 helpers (one statement per call!)
├── src/tenant.rs              the per-shop key prefix (R2 + D1)
└── src/bin/ddl_dump.rs        dumps the shop schema into the bundle

frontend/                      the shop's storefront + studio (TypeScript + StyleX)
├── index.html product.html    the storefront shells (mount only)
├── studio.html dashboard.html the studio + the owner dashboard shells
├── src/main.ts                the boot (data-page → the page module)
├── src/pages/                 landing, product, studio, dashboard
├── src/core/                  api.ts (the only fetch), store.ts, format.ts
├── src/components/            the shop UI: product-card, studio, dashboard, …
└── src/styles/                the StyleX slots: tokens, base, card, dash, …

shared/src/                    models, filter, photo, timeline, whatsapp, currency
imgpipe/src/lib.rs             the HEIC→JPEG wasm (the studio's photo intake)
```

---

## 2. The runtime picture

| Piece | Where it lives |
|---|---|
| The control plane | Worker `tryon-platform` on `latiforge.com` (`workers_dev = false`) |
| The platform database | D1 `tryon-platform-db` — users, shops, hostnames, credits, codes, audit |
| A tenant shop | Worker `shop-{id8}` on `{sub}.latiforge.com` (or the shop's own domain) |
| A tenant's database | D1 `shop-{id8}` — the catalogue, the categories, the settings |
| The bundles (the shop code) | R2 `tryon-bundles` → `bundles/<version>/` |
| The shop's images | R2 `tenant-images` → `shops/{id8}/…` |
| The try-on provider | the Genlook account (the key lives in the platform DB) |
| The platform's own copy | R2 `tryon-bundles` → `platform/self/*` (the self-heal) |

---

## 3. The workflows

**Release (the only way binaries are built).** CI is the builder; the
deploy is API-only — no wrangler at runtime.

```bash
git tag v0.9.99 && git push origin v0.9.99   # .github/workflows/release.yml
# → artifacts: tryon-worker, tryon-bundle, tryon-platform, tryon-frontend
bun scripts/deploy-platform.ts <platform-artifact-dir>   # the control plane
# → the bundle goes to R2, then a redeploy moves a shop onto it
```

**Local checks (the machine may not build binaries — see `AGENTS.md`).**

```bash
./scripts/ram-check.sh -p <crate>   # cargo check --tests, in RAM
./scripts/ram-test.sh  -p <crate>   # cargo test, in RAM
./scripts/check-bloat.sh --max 500  # the file-size gate
cd frontend && bun run check        # tsc --noEmit
cd SaaSTryon/platform/frontend && bun run check
```

**Local dev.** `./dev-all.sh` runs the shop worker (`wrangler dev`, :8787)
and the shop frontend (`bun run dev`, :8811); `mock-genlook/` stands in
for the try-on provider. See `docs/LOCAL_RUN.md`.

---

## 4. The documentation

| Doc | What it answers |
|---|---|
| `AGENTS.md` | the rules of this machine (never build binaries here) |
| `docs/ARCHITECTURE.md` | the shop's architecture and the phase plan (§7) |
| `docs/LOCAL_RUN.md` | how to run it locally |
| `docs/STUDIO_SPEC.md` | how the studio must behave |
| `docs/ACCOUNTS.md` | what lives in the Cloudflare account |
| `SaaSTryon/docs/PLATFORM.md` | the platform's architecture, decisions and the live findings (§10) |
| `SaaSTryon/docs/SHOP-API.md` | every endpoint of both halves |
| `SaaSTryon/docs/Deploy.md` | how a release is shipped |
| `SaaSTryon/docs/DESIGN.md` | the console + landing UX spec |
| `frontend/HANDOFF.md` | the shop frontend's contract and its owner rules |

---

## 5. House rules

- **Never build a binary on this machine** — CI builds (`AGENTS.md` §1).
  `cargo build`, `cargo run`, `--release` and `cargo install` are off-limits;
  `cargo check`/`cargo test` go through the RAM wrappers.
- **The frontend never talks to the database**: it goes through the API
  (`platform/frontend/src/api.ts`, `frontend/src/core/api.ts`).
- **The D1 `exec()` re-splits on `;`** — every statement goes through one
  prepared call (`store::exec_one`).
- **Secrets never live in the repo**: `.env` and `credencials.txt` are
  local and untracked.
