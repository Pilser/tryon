# PLATFORM.md — SaaSTryon platform research & decisions

Everything discovered while designing the platform; sources recorded inline
with their "last updated" dates so future readers can re-verify. Written
2026-10-19. Companion files: `../README.md` (folder purpose), the tryon repo
`docs/ARCHITECTURE.md` (the shop itself).

## 0. One-paragraph summary

Cloudflare's multi-tenant stack fits this product exactly: shops run as
**plain deployed Workers with their own hostnames**, a control-plane Worker
in **Rust** does signup → admin approval → deploys each shop via the normal
Workers **script-PUT API** (no Workers for Platforms subscription, no
dispatch namespace, no dispatcher workshop — D-P1 rev, §4.1), and Genlook
calls go through a small proxy Worker reached by a baked service binding
(the Genlook key never in shop code). Frontends are **React + StyleX**,
built to `dist/` and served as **static assets with edge caching** (pages
never invoke workers; hashed assets immutably cached, `Cache-Tag`
purge-by-tag as fallback — purge-by-tag is on ALL plans since 2025-04).
Free plan covers build/staging; the **$5/mo** Workers Paid tier is the only
planned direct spend before live tenants (per-shop D1 caps + the 100 k
requests/day removal). Usage prices are the same as WfP's ($0.30/M
requests, $0.02/M CPU-ms); custom hostnames cost $0.10/hostname/month
beyond 100 included on any plan.

---

## 1. Sources studied

| Topic | Source (all developers.cloudflare.com) | Notes |
|---|---|---|
| Get started | `/cloudflare-for-platforms/workers-for-platforms/get-started/` (upd. 2026-08-14) | Deploy button flow; 3 components; path routing demo |
| Reference implementation | github.com/cloudflare/templates `worker-publisher-template` → cloned to `-example-templates/cf-templates/` | Single Worker: page UI + `POST /deploy` → Cloudflare SDK upload to namespace; router dispatches `/name` |
| How it works | `/cloudflare-for-platforms/workers-for-platforms/how-workers-for-platforms-works/` (upd. 2026-04-21) | Architecture, request lifecycle, WfP vs service bindings |
| Dynamic dispatch | `/cloudflare-for-platforms/workers-for-platforms/configuration/dynamic-dispatch/` (upd. 2026-09-16) | Binding shape, props to user worker, outbound parameters, routing examples (path/subdomain/KV), 404 on "Worker not found" |
| Hostname routing | `/cloudflare-for-platforms/workers-for-platforms/configuration/hostname-routing/` (upd. 2026-09-24) | Wildcard `*/*` route recommendation, subdomain routing, O2O behaviour table |
| Pricing | `/cloudflare-for-platforms/workers-for-platforms/reference/pricing/` (upd. 2026-04-21) | $25/mo plan, allotments, worked example |
| Limits | `/cloudflare-for-platforms/workers-for-platforms/reference/limits/` (upd. 2026-10-13) | Unlimited scripts, 8 tags, API rate limits, no gradual deploys |
| Bindings | `/cloudflare-for-platforms/workers-for-platforms/configuration/bindings/` (upd. 2026-09-16) | Attach KV/D1/R2/… at upload; `keep_bindings` |
| Multipart metadata | `/workers/configuration/multipart-upload-metadata/` (upd. 2026-07-03) | Full metadata attribute list incl. `tags`, `keep_bindings`, `assets` |
| Static assets | `/cloudflare-for-platforms/workers-for-platforms/configuration/static-assets/` (upd. 2026-10-12) | 3-step asset upload; per-tenant hash salting for isolation |
| API examples | `/cloudflare-for-platforms/workers-for-platforms/reference/platform-examples/` (upd. 2026-05-05) | Deploy/list/delete, delete-by-tag, full SDK snippets |
| Cloudflare for SaaS | `/cloudflare-for-platforms/cloudflare-for-saas/plans/` (upd. 2026-08-14) | Custom hostname quotas/prices; which features are Enterprise-only |
| Commons API calls | `/cloudflare-for-platforms/cloudflare-for-saas/start/common-api-calls/` | Custom hostname create/edit, fallback origin endpoints |
| Worker as origin | `/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/` | Dummy DNS + `*/*` route = Worker as fallback origin |
| Dynamic Workers (new) | `/dynamic-workers/` indexes (upd. 2026-10-12) + pricing page | New runtime primitive; see §6 on why we did NOT pick it |
| D1 limits | `/d1/platform/limits/` (upd. 2026-04-21) | Per-tenant databases explicitly supported; 50 k/account paid, 10 free |
| Skill pack | `~/.agents/skills/cloudflare/references/workers-for-platforms/*` | Cross-checked against live docs; API shapes match |
| **Workers pricing** | `/workers/platform/pricing/` (upd. 2026-10-02) | $5 plan composition; identical usage rates; static-asset reqs free; service-binding calls bill once |
| **Workers limits** | `/workers/platform/limits/` (upd. 2026-10-12) | 100/500 script caps; 10 ms/5 min CPU; 100 k req/day free; custom-domains cap |
| **workers.dev** | `/workers/configuration/routing/workers-dev/` (upd. 2026-09-22) | Auto subdomain per script; enabling/caveats |
| **Custom domains** | `/workers/configuration/routing/custom-domains/` + API `workers/domains` (upd. 2026-09-29) | API-attachable; DNS+cert auto; no wildcards; 100/zone |
| **API rate limits** | `/fundamentals/api/reference/limits/` (upd. 2026-08-25) | 1,200/5 min token limit, headers |
| **10121 gating proof** | answeroverflow.com/m/1250070557475467; terraform-provider-cloudflare#5504; alchemy.run WfP page | dispatch-namespace API fails without WfP entitlement |
| **Dynamic Workers on Paid** | github.com/jokull/agent-cms/issues/53 | `worker_loaders` available on plain Paid (preview use only) |
| **Static assets** | `/workers/static-assets/` + `/workers/static-assets/headers/` (upd. 2026-09/10) | Assets served without worker invocation; `_headers`; default cache-control |
| **Workers Caching / purge** | `/workers/cache/` pages (upd. 2026-10-13) + `/cache/how-to/purge-cache/` | `Cache-Tag`, purge modes, purge-for-all changelog (2025-04-01) |

Dashboard changelog (2025-12-18) adds: namespace creation, dispatch-worker
templates (path + subdomain), and tag management now exist as UI parity —
useful for manual debugging, but every flow the platform needs is API-first.

---

## 2. The four WfP components (as learned)

> Background for the dispatch mode we chose NOT to build first (D-P1 rev,
> §4.1). Kept because the deploy/upload/asset mechanics overlap almost 1:1
> with the plain script-PUT path (§3 applies to both; only the namespace
> wrapper differs).

1. **Dispatch namespace** — container for all deployed shops.
   - Script count: **unlimited** (normal Workers cap at 500/account).
   - Every user Worker runs in **untrusted mode** by default: no `request.cf`,
     no `caches.default`, per-script cache isolation. We do not need trusted
     mode (we own all shop code, but untrusted is the safer default and
     capability-identical for our worker).
   - Best practice (docs): ONE namespace per environment (`production`,
     `staging`), never one per customer. Followed.
2. **Dynamic dispatch Worker** — our edge router. Gets a
   `dispatch_namespaces` binding (`DISPATCHER`), calls
   `env.DISPATCHER.get(name, {props}, {limits, outbound}).fetch(request)`.
   Runs **platform logic** per request: hostname→shop lookup, tenant
   suspension block, per-tier CPU/subrequest limits, pass tenant context via
   `props` (e.g. `shopId` for the shop worker) and via `outbound`
   parameters (e.g. `{ shopId, requestId }` for the outbound worker).
3. **User Workers** — the shops. Deployed *by the platform* through the
   REST/SDK upload API (§3), each with its own bindings (private D1, R2
   bucket, `SHOP_ID`, `PLATFORM_TOKEN`, injected assets).
4. **Outbound Worker** — intercepts `fetch()` made by user Workers.
   Configured on the *dispatch namespace binding*: `outbound {service,
   parameters}`; the dispatcher passes context per request
   (`env.DISPATCHER.get(name, {}, {outbound: {tenant: {...}}})`) and the
   outbound worker reads it as env vars (`env.tenant.shopId`).
   - Catches **all plain `fetch()`** from user workers; does NOT intercept
     Durable Object or mTLS-bound fetches (we don't use those in shops).
   - With an outbound worker configured, `connect()` TCP sockets are
     disabled for user workers (fine — the shop only fetches).

**Request lifecycle** (our stack):

```
Browser → shop.customer.com  (customer CNAME / custom hostname)
       or amina.latiforge.com   (our wildcard subdomain)
  → dispatcher Worker  (wildcard route */* on our zone)
      lookup hostname in KV → { shopId, scriptName, status }
      env.DISPATCHER.get(scriptName, {props:{shopId}},
                         {limits: tier, outbound:{tenant:{shopId,...}}})
  → shop User Worker (Rust wasm + static assets)
      every fetch() → outbound Worker (Genlook key injected, quota enforced)
  → response back through dispatcher
```

One billed request per dispatch→user→outbound chain; CPU is summed across
the chain — so HTTP-only per-request work is exactly the price shown in §4.

---

## 3. Deploy API (what the platform actually calls)

Base: `https://api.cloudflare.com/client/v4` + `Authorization: Bearer
<platform token>`. Account ID + namespace come from platform config.

### 3.1 Namespace lifecycle

```
POST  /accounts/{id}/workers/dispatch/namespaces            {name}
GET   /accounts/{id}/workers/dispatch/namespaces/{ns}
```
(SDK: `cf.workersForPlatforms.dispatch.namespaces.get/create` — the template
does get→catch→create; `wrangler dispatch-namespace create` exists too.)

### 3.2 Upload/overwrite a user Worker (the deploy action)

```
PUT /accounts/{id}/workers/dispatch/namespaces/{ns}/scripts/{script}
  multipart/form-data:
    metadata = (JSON; see below)
    <main_module part>        type: application/javascript+module
    (+ optional extra parts: wasm modules, asset-completion link)
```

`metadata` (per multipart-upload-metadata + WfP pages):

```json
{
  "main_module": "shop.mjs",
  "compatibility_date": "2026-10-19",
  "bindings": [
    { "type": "d1",         "name": "DB",      "id": "<per-shop D1 id>" },
    { "type": "r2_bucket",  "name": "PRODUCTS","bucket_name": "tenant-images" },
    { "type": "plain_text", "name": "SHOP_ID",  "text": "<shopId>" },
    { "type": "secret_text","name": "PLATFORM_TOKEN", "text": "<random>" },
    { "type": "assets",     "name": "ASSETS" }
  ],
  "tags": ["shop:<shopId>:yes", "tier:starter", "env:production"],
  "assets": { "jwt": "<completion-token>", "config": {} },
  "keep_bindings": ["d1", "r2_bucket"]
}
```

Key behaviours verified from docs + template:

- **First upload is synchronous** (changelog 2025-02-20): the 200 means the
  shop is immediately dispatchable — no wait-loop needed after create.
- **Updates**: the same PUT creates a new version that goes to 100% at once
  (`get()` always injects the live version). No gradual deploys for user
  workers — platform-side mitigation: dispatch-level flag/KV for staged
  routing if we ever need it.
- **`keep_bindings`** preserves resource bindings across redelopys when the
  metadata only carries the subset being changed — use it whenever we redeploy
  a shop with a partial metadata (critical: never silently drop a tenant's D1).
- **Tags**: max 8/script, no `,`/`&`; used for bulk ops. Delete an entire
  customer's shops: `DELETE .../scripts?tags=shop:<id>%3Ayes` (SDK examples).
- **List**: `GET .../namespaces/{ns}/scripts` (paginated;
  `?per_page=100&page=N` / SDK async iterator).
- **Delete one**: `DELETE .../scripts/{script}`.
- **API rate limits**: 1200 req / 5 min per user token, 200/s per IP, global
  — the deployer needs a per-account serial queue + exponential backoff (the
  template's `deploy-wfp.ts` doesn't bother; our platform must).

### 3.3 Static assets (the shop frontend — `frontend/dist`)

3-step flow, platform-side (docs: static-assets + platform-examples):

1. `POST .../namespaces/{ns}/scripts/{script}/assets-upload-session` with a
   `manifest` of `path → {hash, size}`; hash = **first 16 bytes of
   SHA-256, 32 hex chars**; response `{jwt, buckets}`.
2. `POST /accounts/{id}/workers/assets/upload?base64=true` per bucket with
   the session JWT; field name = hash, value = base64 content, part
   content-type = file MIME. Final response returns a **completion JWT**
   (valid 1 h).
3. `PUT .../scripts/{script}` with `metadata.assets.jwt = completion token`
   and a `{type:"assets", name:"ASSETS"}` binding; shop code calls
   `env.ASSETS.fetch(request)` (the `routing_mode`/`html_handling` config is
   optional).

Timers: session JWT 1 h; completion JWT 1 h. Files already known to
Cloudflare don't appear in `buckets` — cheap redeploys after a small change.

**Per-tenant isolation of assets**: assets are shared across the namespace
by content hash. For salting, compute
`hash = sha256(shopId + bytes).slice(0,32)` per tenant so identical files of
two tenants are not shared. Our frontend/dist is identical for all tenants
configuration is data-driven, so v1 can skip salting and revisit if we later
give tenants custom themes/assets.

### 3.4 The shop code bundle (Rust wasm + assets)

Legacy doc pages describe wasm uploads but the current authoritative shape
must be re-verified against a live namespace (open question Q1 in §8).
The plan: CI already builds `worker` → `*.wasm` + wraps assets; the
packaging script creates a **bundle manifest** in R2:

```
bundles/<version>/
  manifest.json     # {files:[{name,type,size,sha256}], main_module, compat}
  shop.mjs          # JS glue: fetch handler -> env.ASSETS or SHOP_WASM
  shop.wasm         # compiled tryon worker
  assets/*.…        # frontend/dist contents for the 3-step upload
```

The deployer pulls the manifest, streams parts, and uploads. First live
action item: a throwaway deploy of this exact bundle via REST to confirm
the wasm part (`application/wasm`) + `web_assembly` binding / import shape
attaches correctly inside a dispatch namespace.

---

## 4. Pricing (verified 2026-04/10 sources)

### Workers for Platforms (the platform's Worker plan)

**$25/month subscription** + usage:

| Dimension | Included / month | Overage |
|---|---|---|
| Requests (dispatch→user→outbound counted **once**) | 20 M | $0.30 / additional M |
| CPU time (summed across that chain) | 60 M CPU-ms | $0.02 / additional M CPU-ms |
| Scripts (user Workers in namespaces) | 1000 | $0.02 / script / month |

Worked example in docs (100 M req, avg 10 ms CPU, 1200 scripts) = $71.80/mo.
Our v1 maths: 100 shops × ~2 M req ≈ 200 M req ≈ $54 + CPU(~1 ms avg) ≈
+$3-8 → comfortably under $100/mo. Bought via dashboard
(`dash → Workers for Platforms`).

### Cloudflare for SaaS (custom hostnames in OUR zone)

| | Free | Pro | Business |
|---|---|---|---|
| Hostnames included | 100 | 100 | 100 |
| Max hostnames | 50,000 | 50,000 | 50,000 |
| Per additional hostname | $0.10 | $0.10 | $0.10 |

Enterprise-only (NOT for us initially): wildcard custom hostnames, custom
hostname `custom_metadata`, apex proxying, custom certificates/CSR.
→ We route via the **hostname KV map** instead of `custom_metadata`.

### Dynamic Workers (open beta, March 2026) — the alternative checked

Runtime Worker Loader binding; priced on requests ($0.30/M), CPU
($0.02/M CPU-ms) and **unique workers created per day** (1000/mo included,
then $0.002/worker/day). Not chosen for hosting long-lived shops: it is an
ephemeral "spin up to run code" primitive without durable per-tenant
routing (each run validates identity); Workers for Platforms is the
dedicated "customer deploys an app with its own hostname" product. We keep
Dynamic Workers on file for the preview/playground feature (§9 Phase G).

### 4.1 Can the $25/month WfP plan be bypassed? — YES (verified 2026-10-19)

Question asked: can one platform Worker deploy other Workers automatically
using just an API access token, WITHOUT the $25 Workers for Platforms
subscription? Answer: **yes, via the plain Workers script API** — with real
trade-offs (shop cap, no egress interception). Verified facts:

| # | Fact | Source |
|---|---|---|
| B1 | Dispatch-namespace endpoints (`GET/POST /accounts/{id}/workers/dispatch/namespaces`, upload-into-namespace) are **hard-gated**: accounts without the WfP subscription fail with `code 10121 no_access_to_dispatch_namespaces` — "You can purchase it within the Cloudflare dashboard ... if you are an Enterprise customer please contact your account team". This path CANNOT be bypassed. | answeroverflow.com/m/1250070557475467 (wrangler `dispatch-namespace list` → 10121); terraform-provider issue #5504 (same message verbatim); alchemy.run WfP page ("paid add-on ... entitlement error") |
| B2 | The plain script API (`PUT /accounts/{id}/workers/scripts/{name}` with metadata: bindings, tags) works on Free and $5 Paid accounts — **no entitlement gate**. A platform Worker can call it at runtime with a scoped API token (exactly the publisher-template pattern: `CLOUDFLARE_API_TOKEN` secret + `fetch("https://api.cloudflare.com/...")`). | worker-publisher-template `scripts/deploy-wfp.ts`; wrangler deploys to free accounts daily |
| B3 | Every deployed script **auto-gets** `{{name}}.{{account-subdomain}}.workers.dev` when created (renames follow the name). Free per-shop subdomain, no dispatcher needed. Name limits (≤63 chars, `[a-z0-9-]`) — our `shop-<id8>` convention already fits. | docs `workers/configuration/routing/workers-dev` |
| B4 | Script caps: **100 (Free) / 500 (Paid)**; docs footnote: "building a platform where end customers deploy their own sites → use Workers for Platforms, which runs an unlimited number of user Workers". | docs `workers/platform/limits` (Number of Workers + footnote 1) |
| B5 | Workers Paid = **$5/mo**: 10 M requests + 30 M CPU-ms included, overage prices IDENTICAL to WfP ($0.30/M req, $0.02/M CPU-ms). Static-asset requests are free. Service bindings between our own workers bill as ONE request. | docs `workers/platform/pricing` |
| B6 | Custom Domains: attachable via API (`/accounts/{account_id}/workers/domains`, permission `Workers Scripts Write/Read`); DNS + cert auto-issued. Cap **100 per zone**; `*`-wildcard custom domains NOT supported; hostname must be in a zone on OUR account; can't attach where a CNAME already exists. | docs `workers/platform/limits` (Routes and domains) + `workers/configuration/routing/custom-domains` + API reference pages |
| B7 | Same API token rate limit on both paths: **1,200 req / 5 min** (per user/account token) + `retry-after`/`Ratelimit` headers. Deployer queue + backoff unchanged. | docs `fundamentals/api/reference/limits` |
| B8 | D1 per-shop stays viable on plain Paid: **50,000 DBs/account** (expandable by request); free = 10 DBs AND since 2026-09-01 free-tier daily row-read/write enforcement (queries FAIL past the limit) → Free plan is staging-only, never for tenant shops. | docs `d1/platform/limits`; changelog 2026-09-01-d1-free-tier-limit-enforcement |
| B9 | Outbound-worker egress interception + per-tenant CPU limits (`limits:{cpuMs}` in dispatch props) are **WfP-only**. Substitute (we own the shop code): at deploy time bake a service binding `GENLOOK_PROXY → platform genlook-proxy worker` into the shop script, or have the wasm call `https://platform.latiforge.com/genlook/*` with its per-shop token. Functionally equivalent metering; loses the "third-party code" safety net, which we don't need. | docs `workers/platform/pricing` (Service bindings); WfP outbound-worker docs |
| B10 | `worker_loaders` (Dynamic Workers) confirmed available on plain Paid (third-party issue; not WfP-gated) — but still ephemeral → remains preview-only per §4. | github.com/jokull/agent-cms/issues/53 |

Three viable routes compared:

| | WfP $25/mo | Plain Free | Plain Paid $5/mo ← START HERE |
|---|---|---|---|
| Shop cap | 1000 scripts, +$0.02/each | 100 total | 500 total |
| Subdomain routing | dispatcher + KV (`*.latiforge.com`) | workers.dev per script | workers.dev per script + `/workers/domains` custom domains (100/zone) |
| Owner custom domains | CfS 50,000 hostnames | CfS (same flow) | CfS (same flow) |
| Per-shop D1 | 50k ✓ | **10 ✗** | 50k ✓ |
| Traffic included | 20 M req/mo | 100 k req/DAY account-wide | 10 M req/mo |
| 100 shops × 2 M req | $25 + ~$54 req+CPU ≈ **$79/mo** | impossible | $5 + ~$52 ≈ **$57/mo** |
| Untrusted isolation | yes | n/a | n/a (we ship the code) |
| Rolling deploys | all-at-once | gradual (versions) possible | gradual (versions) possible |

So for our early scale the "bypass" is also cheaper: one $5/mo plan instead
of $25. The WfP plan buys us: unlimited scripts (≈1100+ shops), KV-hostname
wildcard routing under `latiforge.com` without per-shop route churn, untrusted
isolation, outbound egress interception, and 2× the included traffic/CPU.

**Decision D-P1 (finalised 2026-10-19): ONE backend only — the plain
Workers script API (script-PUT). No dispatch namespace, no dispatcher, no
outbound worker, no WfP purchase, no dual-target abstraction.** If WfP is
ever needed later (see triggers below) the hard research is in this
section and the publisher-template clone; it would be an additive module at
that point, not an architecture from day one.

- The platform deploys shops with `PUT /accounts/{id}/workers/scripts/{name}`
  (B2) and attaches hostnames with `PUT /accounts/{id}/workers/domains` (B6).
- **Free plan** is fine for building and staging (B4: 100 scripts). **The
  $5/mo Workers Paid tier is required before real tenant shops** — it buys
  per-shop D1 databases (10 → 50,000; B8), removal of the 100 k
  requests/DAY account cap, and 30 s CPU. That is a dashboard toggle, the
  only planned direct spend, and it is $5 — not $25.
- WfP revisited ONLY when: (a) ~400 shops (500-script cap), (b) >100 custom
  domains per zone, (c) shop count growth forces wildcard KV routing instead
  of per-shop custom domains. Usage prices are identical (B5), so scaling is
  about caps, not rates.

Cache plan for serving the frontend (verified 2026-10-19):

| # | Fact | Source |
|---|---|---|
| C1 | Static asset requests route to a dedicated asset layer and do NOT invoke the Worker code (default routing) — requests to assets are **free and unlimited**, automatically cached across Cloudflare's edge (tiered caching). | docs `workers/static-assets` ("Caching behavior" + routing); pricing page fn 3 |
| C2 | Default asset response header: `Cache-Control: public, max-age=0, must-revalidate` (browser revalidates HTML each load); custom headers via a `_headers` file (limit 100 rules). | docs `workers/static-assets/headers` |
| C3 | **Purge-by-tag is available on ALL plans now** — since 2025-04-01 every cache purge method (URL, tag, prefix, host, everything) is unlocked for all tiers. Tags attach via the `Cache-Tag` response header (printable ASCII, ≤16 KB aggregate, case-insensitive). | changelog 2025-04-01-purge-for-all; cache docs purge-by-tags |
| C4 | Invalidations never touch Workers-private cache or (for static assets) the content-addressed storage: a redeploy ships a new asset manifest, and hashed filenames (`/assets/*.js`) mean new names — HTML revalidates (C2), long-cache the hashed assets via `_headers` (`max-age=31536000, immutable`). This alone makes redeploys correct without any purge. | docs `workers/static-assets` + `workers/reference/how-the-cache-works` |

→ Platform UI (and each deployed shop frontend) is served from `dist/`
static assets, NOT computed by the backend: pages never run the Worker;
`/api/*` is the only Worker surface. `Cache-Tag: platform-ui:v<n>`
(released by redeploy + optional zone purge) is the fallback invalidation
path if manual cache surgery is ever needed (Q12).

---

## 5. Limits to respect (WfP page for dispatch mode; plain-plan limits per §4.1 for script mode)

| Limit | Value | Impact on us |
|---|---|---|
| **Scripts per account (script mode)** | 100 Free / 500 Paid | the real shop cap; WfP revisit trigger at ~400 |
| Scripts per namespace (dispatch mode, background) | unlimited | 1000 included in WfP plan, rest $0.02 each |
| Tags per script | 8 | use `shop:<id>:yes`, `tier:<t>`, `env:<e>` |
| Gradual deployments | dispatch mode: not supported | script mode: normal Workers gradual deploys WOULD be available; v1 stays all-at-once |
| `request.cf` | unavailable (untrusted mode) | shop code must not use it (it doesn't) |
| `caches.default` | disabled (untrusted mode) | shop uses asset fetch + R2 only |
| API client rate | 1,200/5 min per user token | deployer queue + backoff |
| API per-IP | 200/s | same |
| GraphQL analytics | 320/5 min | dashboards must cache |
| Durable Object namespaces | no WfP limit | n/a |
| D1 databases per account | 10 free / 50,000 paid (expandable to millions) | **1 shop = 1 D1 OK (needs Paid)** |
| D1 DB size | 10 GB paid / 500 MB free | per shop is plenty |
| Routes per zone | 1,000 | script mode: no wildcard route needed (per-shop custom domains); one route only if we add a router worker later |
| Custom domains per zone (Worker custom domains) | 100 | **script mode uses these for `{{shop}}.latiforge.com`**; customer-owned domains still via CFfS (50,000 hostnames) |
| env vars / bindings per script | 64 Free / 128 Paid (~5,000 bindings max) | 5-6 bindings per shop ≪ cap |
| Workers KV namespaces per account | 1,000 (all plans) | shared namespaces, no per-tenant KV |

D1's own FAQ explicitly blesses the per-shop-database pattern ("per-user,
per-tenant databases, thousands at no extra cost"). The deployer creates a
D1 per shop at deploy time, applies the shop schema, then binds `{type:
"d1", name:"DB", id}` — zero changes to the shop's data model.

---

## 6. Routing: subdomains *and* custom domains

> §6.1–6.2 dispatch-mode notes are kept as background research (what we
> DO when/if WfP is ever bought — §4.1 trigger list). The script-mode
> replacement is §6.4 and is what v1 builds.

### 6.1 Subdomains via wildcard dispatcher (dispatch mode only — background)

1. Zone `latiforge.com` in the SAME Cloudflare account as WfP.
2. DNS: `*` CNAME/A → dummy origin (`A 192.0.2.0`, proxied orange).
3. Route (Workers Routes): wildcard `*/*` on the zone → dispatcher.
4. Dispatcher: `sub = hostname.split(".")[0]` → KV lookup `host:{sub}.latiforge.com`
   → `DISPATCHER.get(scriptName, ...)`. `latiforge.com` itself (bare apex) is
   reserved by checking the subdomain count (2 dots) or an explicit exclude.

`*.saas.com/*` route is also documented for subdomain-only setups; we use
`*/*` so the SAME dispatcher later serves custom hostnames.

### 6.2 Owner custom domains via CFfS (both modes — unchanged)

Docs-recommended production pattern (hostname-routing page):

1. Enable **Cloudflare for SaaS** on our zone; create a proxied
   `proxy-fallback A 192.0.2.0` record; set it as **fallback origin**
   (`POST /zones/{zone}/custom_hostnames/fallback_origin`). Worker-as-origin
   guide: any dummy/`100::` originless record + `*/*` route = the Worker
   serves all custom hostname traffic.
2. Shop owner (in their shop's new Settings panel) enters `mystore.com`;
   platform API calls:
   - `POST /zones/{zone}/custom_hostnames`
     `{hostname, ssl: {method: "http" or "txt"}}` → returns validation
     target(s); response `id` stored against the shop.
   - Owner adds `CNAME mystore.com → target.latiforge.com` (or TXT for DCV).
   - Platform polls `GET /zones/{zone}/custom_hostnames/{id}` until
     `status: active` (validation statuses documented; backoff schedule is a
     7-day routine) — the deploy UI shows the state.
3. Routing: when `status` becomes active (or on first record add), the
   dispatcher's KV gains `host:mystore.com → {scriptName, shopId}`.
4. O2O behaviour table (docs): with `*/*` the dispatcher is invoked no
   matter whether the owner's own zone is orange- or grey-clouded — this is
   why `*/*` is the docs recommendation and our choice.
5. Cost: $0.10/hostname/month after the 100 included; no per-plan feature
   we need until then is Enterprise-locked (we avoid `custom_metadata`).

Self-serve apex domain (`mystore.com` root, no `www`): CNAME apex is
technically invalid; docs point to Apex Proxying which is Enterprise-only.
v1 replies: "point the apex via your DNS provider's CNAME-flattening, or
use www."; document this limit.

### 6.3 workers.dev

User workers do NOT get their own `*.workers.dev` hostname (workers.dev
belongs to the dispatcher's account; the docs' template exposes tenants via
PATH on the dispatcher). So `<script>.<account>.workers.dev` is NOT a tenant
surface; only the dispatcher is. For preview URLs we don't rely on workers.dev
at all — WfP is explicitly listed as unsupported for Worker preview URLs
(changelog 2025-07-23). Preview = `<tenant>.latiforge.com` + dispatch flag or a
separate staging namespace script name.

In script mode (§4.1) this inverts: every script DOES auto-get
`{{name}}.{{sub}}.workers.dev` (B3) — it becomes the default tenant URL plus
the automatic preview surface for version URLs. The docs still mark
workers.dev as "treated as a Free website ... not business-critical", so the
plan treats workers.dev as the fallback/beta URL and attaches a Custom
Domain (`{{shop}}.latiforge.com`) as the production URL (§6.4).

### 6.4 Script-mode routing (v1 — what we build)

No dispatcher, no KV hot path:

1. **workers.dev auto-URL**: `shop-<id8>.<account-sub>.workers.dev` comes
   free at script creation (B3). Platform stores it on the shop row at
   deploy time; shop never needs it published if custom domain is on.
2. **Custom domain on OUR zone** (production URL): after successful script
   PUT, registrar calls `PUT /accounts/{id}/workers/domains`
   `{zone_id, hostname: "{{sub}}.latiforge.com", service: "shop-<id8>",
   environment: "production"}` → DNS + cert auto-issued (B6). Platform D1
   `hostnames` row holds `cf_domain_id` + status; KV ROUTE_KV is pure
   bookkeeping for the platform dashboard (host→shop), never a runtime
   routing dependency.
3. **First deploy latency**: domain enable is near-instant (provisioned by
   API, no customer DNS dance); Q10 covers the pending-cert corner.
4. **Fleet note**: 100 custom domains per zone — plenty for v1; when the
   zone fills we attach additional zones (routed zones per Worker: 1,000)
   or switch that tier to WfP KV wildcard routing.

---

## 7. Platform architecture (SaaSTryon)

### 7.1 Components (script mode — 3 workers, ONE account)

| Component | Worker | Bindings |
|---|---|---|
| Control plane (`platform/`) | signup, login, admin approval, deploy orchestration (script-PUT), hostname registrar, token/credit requests, serves its own admin UI from static assets | platform D1, ROUTE_KV (bookkeeping), BUNDLES (R2), secrets: CLOUDFLARE_API_TOKEN, ADMIN_TOKEN, GENLOOK_API_KEY (grant accounting) |
| Genlook proxy (`genlook-proxy/`) | single small worker: shops call it with their per-shop token; it injects GENLOOK_API_KEY, meters per-shop credits, enforces tier limits | KV counters (REFS_KV), platform D1 (read), secrets: GENLOOK_API_KEY |
| Shop workers (deployed copies) | existing tryon shop (Rust wasm + React dist), uploaded via script-PUT by the platform | DB (per-shop D1), PRODUCTS + tenant R2 (`shops/<id>/…`), ASSETS, GENLOOK_PROXY (service binding), SHOP_ID, PLATFORM_TOKEN |

One Cloudflare account. `latiforge.com` zone hosts the control plane on
the APEX (`latiforge.com`, with the landing page) and per-shop custom domains
(§6.4) + the platform worker itself. Shops get their own D1 (isolation),
share `tenant-images` R2 (key prefix `shops/<shopId>/…`) and the platform
`BUNDLES` bucket holds the released shop artifacts (wasm + dist) the
deployer uploads from.

### 7.1.1 Tech stack & backend modularity (hard rules)

- **Backend = Rust** (workers crate) — same shape as the tryon shop: wasm
  module, JSON API, D1/KV/R2 bindings. One crate per worker, in the existing
  Cargo workspace: `crates/platform/` (control plane), `crates/genlook-proxy/`
  (proxy). Binary never built locally — CI release only (AGENTS.md).
- **Frontend = React + StyleX** reusing the tryon design language: the
  shared `ui.stylex.ts` kit (cards = hairline border + whitespace, no round
  buttons, full-width buttons on phones, names over device ids) is imported
  into the platform frontend as its style source; platform pages live in
  `SaaSTryon/platform/frontend/` (Vite → `dist/`).
- **Serving**: the platform worker's `[assets]` binding serves
  `SaaSTryon/platform/frontend/dist` under default routing (assets first, no
  worker invocation — C1/C4 in §4.1); `/api/*` requests fall through to the
  Rust wasm. `_headers` (checked into `dist`) sets immutable long-cache for
  hashed assets + `Cache-Tag: platform-ui:v<n>` purge fallback.
- **Modularity is enforced, not aspirational** (AGENTS.md §4 + bloat gate):
  - one domain per file, ≤300 lines target / **≤500 hard**,
    `check-bloat.sh --max 500` runs per phase;
  - `lib.rs`/`mod.rs` re-export only;
  - frontend pages never import backend internals — the ONLY boundary is
    `POST /api/v1/<command>` mirroring the shop's `command-api::dispatch()`;
  - non-TUI Rust ships tests.
- Planned module split for `crates/platform/src/` (starter, tune as it
  grows — never merge domains to "save lines"):
  | File | Domain |
  |---|---|
  | `http.rs` | router: `/api/v1/*` dispatch → command fns; static fallthrough |
  | `auth.rs` | signup/login/session tokens, password hashing, gate |
  | `admin.rs` | approve/suspend/allowance/admin audit |
  | `shops.rs` | shop lifecycle: create(→deployer), redeploy, block, delete |
  | `store.rs` | D1 schema+migrations, queries (users/shops/hostnames/credits/credit_requests/audit) |
  | `deployer/cf_api.rs` | REST client: auth header, error mapping, 429 backoff, queue (B7) |
  | `deployer/bundle.rs` | BUNDLES manifest → multipart script PUT + assets session (Q1 probe) |
  | `deployer/provision.rs` | per-shop D1 create + schema apply, bindings set |
  | `hostnames.rs` | `/workers/domains` registrar + state machine (§6.4) |
  | `billing.rs` | credits/credit_requests ledger + tier limits |
  | `cfg.rs` | env/config bindings, reserved subdomains, validation |

### 7.2 Platform D1 schema (draft)

```sql
users(id, email TEXT UNIQUE, contact TEXT, status,          -- pending|approved|suspended
      deploy_allowance INT DEFAULT 0, deploy_used INT DEFAULT 0,
      created_ms, approved_by, note)
shops(id, owner_id, name, subdomain TEXT UNIQUE,          -- amina → amina.latiforge.com
      cluster_id TEXT UNIQUE,                              -- wfp script name
      status,                                              -- deploying|live|blocked|deleted
      tier TEXT,                                           -- starter|pro|…
      depot_version, created_ms)
hostnames(id, shop_id, hostname TEXT UNIQUE,               -- custom domains
          cf_hostname_id, status,                          -- pending|active|failed
          created_ms)
credits(shop_id, product TEXT,                             -- tryon_tokens
        granted_total, used_total, updated_ms)
credit_requests(id, shop_id, requested INT, reason, status -- pending|approved|rejected
                , decided_by, created_ms)
audit(id, actor, action, subject, meta, created_ms)        -- admin actions
```
(Migration files in `SaaSTryon/migrations/`, one file per phase, matching
the tryon repo's "one domain per file" discipline.)

### 7.3 Deploy flow (platform `deployer` module)

```
authed user → "Deploy shop" (POST /platform/v1/shops
              {subdomain, shopName, tier=starter})
1. validate subdomain (dns-safe, reserved list, free)
2. enforce allowance: users.deploy_used < deploy_allowance else 402
3. provision: per-shop D1 create + shop schema (binding `DB`)
4. generate PLATFORM_TOKEN (random secret per shop)
5. script-PUT (cf_api.rs + bundle.rs):
   PUT /accounts/{id}/workers/scripts/shop-<id8>
   multipart: wasm module + metadata {main_module, bindings:
   [DB d1, tenant-images R2, GENLOOK_PROXY service binding,
   SHOP_ID, PLATFORM_TOKEN], compat date} + asset upload session
   (workers.dev auto-URL comes with the script, B3/Q8)
6. registrar (hostnames.rs): attach custom domain
   {sub}.latiforge.com via PUT /workers/domains (B6, §6.4)
7. KV bookkeeping: host:{sub}.latiforge.com -> {script, shopId}
   (dashboard only — NOT a hot routing path)
8. record shop cluster_id (script name), audit, decrement allowance
response → shop live at https://<sub>.latiforge.com
(fallback while cert pending: the script's workers.dev auto-URL)
```

Idempotency: re-PUT overwrites the script in place (plain script API
overwrites the deployment on each PUT) — support "redeploy on new bundle
version" with the same script name; sent bindings are re-declared in full
every deploy (Q5 semantics apply to plain scripts too; verify on staging).
Version rollbacks = keep R2 bundle history, re-upload; normal Workers
gradual versions exist in script mode if ever wanted (v1 auto-at-once).

### 7.4 Genlook proxy (the shop never holds the key) — service binding, no outbound worker

Outbound-worker interception is WfP-only (B9), so script mode bakes a
service binding into every shop's script at deploy time instead:

- Shop script metadata includes `{type: "service", name: "GENLOOK_PROXY",
  service: "genlook-proxy"}` — worker→worker via service binding is one
  billed request, no internet hop (B5). The shop's wasm already needs one
  tiny change (see §7.5/F): send Genlook calls to the proxy binding URL
  path instead of `genlook` directly.
- genlook-proxy logic: if URL path == `/tryon/v1/tryon` → check
  `credits.granted - credits.used > 0` for the `PLATFORM_TOKEN`-identified
  shop (cheap point read + KV counter for hot-path speed), inject
  `GENLOOK_API_KEY` (secret lives only here), forward upstream, bump usage
  counters, rewrite the shop's `GET /tryon/v1/account/credits` response so
  the existing shop UI keeps working untouched (same rewrite the outbound
  worker would have done, just one hop earlier).
- Costs/quota granularity: 1 try-on ≈ 1 token balance unit; grants are rows
  in `credits`. Analytics: proxy keeps per-shop counters in KV + platform
  D1; GraphQL invocation analytics on the proxy and shop scripts support
  the admin dashboards later (Phase H).
- Egress note: without the WfP outbound worker there is no runtime
  egress DENY for shop code — but we ship the shop code ourselves, the wasm
  never gains a generic egress surface beyond product features, and the
  Genlook key is simply absent from shop bindings. App-level allow-list
  stays in the shop code (it only ever calls Genlook + its own APIs).
- Suspension (replaces WfP's per-tenant limits): admin "block shop" = set
  custom domain `enabled: false` (PATCH `/workers/domains/{id}`/delete) +
  disable the script's workers.dev route (`/scripts/{name}/subdomain`
  `{enabled: false}`) → shop 404s at the edge without deleting anything;
  reactivate flips both back. Q8/Q10 cover the exact API shapes on staging.

### 7.5 Shop-side extension (settings page asks the platform for more)

The tryon dashboard gets a new "Platform" card/contact in the owner settings
(built into `frontend/`): "Request more try-on tokens" + "Connect my
domain". Both call the platform control plane:

```
POST https://<platform>/api/v1/shop/credits/request  {requested, reason?}
POST https://<platform>/api/v1/shop/domain         {domain, shop_id?}
Auth: the shop's `PLATFORM_TOKEN` (secret_text binding) for the credit
request; the owner's session for the domain.
```
Purchases later: same endpoint, plus a paid flow badge in the platform
dashboard (real money product not scoped in this research; phase G lists the
gate).

### 7.6 Auth & admin model (matches the shop's own UI language)

- Signup: email + contact (WhatsApp number, owning shop context) →
  `users.status = pending`, deployment blocked.
- Admin gate: same token-card login pattern as the shop dashboard
  (`#db-token` + `#db-login`, `tryon.owner.v1`-like key `tryon.platform.v1`).
  Admin approves (status approved, sets `deploy_allowance`), can suspend
  (§7.4 suspension: domain disabled + workers.dev route off → shop simply
  unreachable; owner sees the shop's 404/deactivated state), can cancel
  (script delete by name + D1 data retained per retention rules).
- Rate limits: simple D1 counters + KV cached plan lookups; deep analytics
  later through per-script GraphQL invocation analytics
  (`workersInvocationsAdaptive` filtered by script name) and the proxy's
  counters.

---

## 8. Open questions / risks (check before/while building)

| # | Question | How to resolve |
|---|---|---|
| Q1 | Exact multipart shape for uploading a **wasm shop worker via plain script-PUT** (`web_assembly` binding vs `application/wasm` part) | throwaway deploy on the staging account; REST trial — does NOT need the WfP plan (=Q1 original scope, now plain-script) |
| Q2 | ~~Does WfP plan purchase have prerequisites~~ — RESOLVED-ish: purchase is self-serve in dashboard (error 10121 message says "purchase it within the dashboard"); WfP is out of build scope (D-P1 rev) | only if WfP path is ever reopened |
| Q3 | R2 bucket count per account cap (shared `tenant-images` strategy) | check dashboard limits page or create-limits |
| Q4 | ~~KV consistency on new-hostname routing~~ — demoted: KV is dashboard bookkeeping only in script mode; routing is native (§6.4) | not a build risk |
| Q5 | Bindings semantics on plain script re-PUT (resend full set each deploy; does it drop bindings if omitted?) | staging trial in Phase C; always resend full set |
| Q6 | Asset hash salting needed only if tenant-special themes ever arrive | revisit if themes ship |
| Q7 | Live pricing surprise (e.g. asset upload pricing changed Oct 2026 per banner) | re-read the live pricing page before card charge |
| Q8 | REST call to enable/disable the script's workers.dev route on create and on suspension (shape = `POST /scripts/{name}/subdomain {enabled}`?) | staging probe before first scripted deploy (B3 default is enabled — verify we can flip it) |
| Q9 | Minimal API-token scopes for script-mode deploys (Workers Scripts Edit + D1 Edit + KV Edit + Zone/DNS? for `/workers/domains` custom domains) | trial token on the staging account; least-privilege per B2 |
| Q10 | Whether `/workers/domains` requires the zone in the same account (B6 implies yes) and what happens while a cert is still provisioning for `{{shop}}.latiforge.com` (shop URL timing on first deploy) | staging probe in Phase D |
| Q11 | Script tags endpoint limits (`/scripts/{name}/tags`, PUT 2 tags per call?) vs inline tags in upload metadata | probe; keep 3-tag convention either way |
| Q12 | Does zone-level purge-by-tag (C3) actually reach *static-asset* responses, or only zone-CDN/Worker-cache content? C4's redeploy+hashed-assets path is primary; tags are fallback | Phase F staging probe: add `Cache-Tag` via `_headers`, purge, observe `CF-Cache-Status` |
| Q13 | Rust worker test harness for the platform crate (shop precedent: pure-logic unit tests via `ram-test`; D1/CF-API paths mocked behind traits; optional `workers-rs` miniflare integration later) | decide in Phase B; keep CI strategy aligned with existing crates |

## 9. Build order (phases)

| Phase | Deliverable | Tests / proof |
|---|---|---|
| A (done) | Platform research doc + folder scaffold + publisher template cloned | doc review |
| B | `crates/platform/` skeleton (Rust worker): http router, `store.rs` D1 migrations (users/shops/hostnames/credits/credit_requests/audit), `auth.rs` signup/login/session, `admin.rs` approval+allowance; `SaaSTryon/platform/frontend/` React+StyleX app with signup/login/token-gate + admin pages in the tryon UI language; `_headers` dist cache rules; static assets serving from the worker | `ram-check`/`ram-test -p platform`: ≥5 Rust tests (signup validation, pending gate, approve→allowance, allowance 402, auth guard); `tsc`; browser probe of the UI; `check-bloat.sh` |
| C | `deployer/` in the platform crate: `cf_api.rs` (REST client, 429 backoff queue per B7), `bundle.rs` (BUNDLES manifest → script-PUT multipart incl. wasm probe Q1 + assets session), `provision.rs` (per-shop D1 + schema + bindings); local mock CF endpoints | unit tests on manifest parsing, idempotent re-PUT vs mock (Q5); live smoke deploy only after account setup (ask before any spend) |
| D (code done) | `hostnames.rs`: `/workers/domains` registrar + workers.dev fallback + suspension helpers (§6.4, Q8/Q10); KV bookkeeping | unit tests on state machine; staging probe with real throwaway script |
| E | `crates/genlook-proxy/`: Genlook key injection + per-shop credit metering + `/account/credits` rewrite (§7.4) | Rust unit tests (metering math, deny-exhausted); mock end-to-end with the harness shop; live Genlook still NOT fired without approval |
| F (code done) | Shop-side: wasm accepts `SHOP_ID`/`PLATFORM_TOKEN`/`GENLOOK_PROXY` binding wiring, R2 key prefixes `shops/<id>/…`, Settings card → platform API (§7.5); platform deploy UI "Deploy shop" form live | browser probes; frontend commit per usual tryon rules; Q12 cache-tag probe |
| G (manual token flow done; CfS domains pending) | Self-serve customer-owned domains (CFfS §6.2) + "buy more tokens" flow behind admin/manual billing gate | API contract tests + staging hostname |
| H | Hardening: per-script GraphQL analytics dashboards, suspension/ban runbook drills, D1 backups (Time Travel), bloat + rate-limit drills | |

Sequencing rule (AGENTS.md compliant): each phase ends with
`./scripts/ram-check.sh -p <crate>` + `./scripts/ram-test.sh -p <crate>` +
`./scripts/check-bloat.sh` + frontend `tsc`/tests + browser probe if UI
changed; Rust binaries are never built on this machine (CI only).

## 10. Live findings (probed against the account on 2026-10-20)

Facts that cost a deploy cycle each - do not re-derive them:

| # | Finding | Consequence in our code |
|---|---|---|
| L1 | D1 `exec()` re-splits the batch on `;`, so a trailing `;` becomes an empty statement ("incomplete input"). | `store::ensure_schema` migrates with ONE prepared statement per call, statements carry no trailing `;`. |
| L2 | A migration file may mention the `";\n"` marker inside a `--` comment - splitting on it yields a comment as a statement. | `split_statements` drops comment lines first. |
| L3 | The asset hash is `sha256(base64(content) + extension)[:32]`, NOT sha256 of the bytes. The manifest is `{"manifest": {"/path": {"hash","size"}}}` with URL paths as keys. | `bundle::asset_hash(path, bytes)`. |
| L4 | The asset session is `POST /accounts/{id}/workers/scripts/{name}/assets-upload-session` (JSON body) -> `{jwt, buckets}`; the files go to `POST /accounts/{id}/workers/assets/upload?base64=true` with parts named by hash and base64 content; the script PUT then carries `assets.jwt`. | `bundle::stage_assets` + `multipart::ScriptPut`. |
| L5 | A Workers script does NOT apply the plain shop's `_redirects`; the shop pages link to `/app/<file>`. | The bundle ships every file under BOTH `/x` and `/app/x`. |
| L6 | The asset path must mirror the wrangler assets dir (`./frontend`): `dist/main.js` is served at `/dist/main.js`. | The packager keeps the directory prefix. |
| L7 | The account's workers.dev subdomain is set once and cannot be renamed ("Account already has an associated subdomain"). | We do not use workers.dev: `workers_dev = false` in the platform wrangler.toml, the apex + `{sub}.latiforge.com` custom domains are the only URLs. |
| L8 | The API token budget is 1,200 req / 5 min (B7) and every wrangler R2 object put is one call. | The bundle ships ~26 files, not the whole frontend tree (69 files burned the budget). |
| L9 | Every Cloudflare call is account-scoped: a bare `/workers/domains` has no route (error 7000). | `domain::attach_request` builds `/accounts/{id}/workers/domains`. |
| L10 | The Genlook proxy lives INSIDE the platform worker (HTTP + `PLATFORM_TOKEN`), not as a separate service. | No `GENLOOK_PROXY` service binding on a shop script. |

Live shape (2026-10-20): control plane on the apex `latiforge.com`
(landing page + `/api/v1/*`), tenant shops on `{sub}.latiforge.com`
(assets + worker + per-shop D1 + shared `tenant-images` R2). A shop is
deployed by the platform alone: script-PUT, per-shop D1 with the bundled
schema, assets upload, and the custom-domain attach - no CI and no local
build per shop.
