# PLATFORM.md — SaaSTryon platform research & decisions

Everything discovered while designing the platform; sources recorded inline
with their "last updated" dates so future readers can re-verify. Written
2026-10-19. Companion files: `../README.md` (folder purpose), the tryon repo
`docs/ARCHITECTURE.md` (the shop itself).

## 0. One-paragraph summary

Cloudflare's multi-tenant stack fits this product exactly: shops run as
**deployed Workers with their own hostnames**, a control-plane Worker does
signup → admin approval → deploy, and Genlook calls go through a platform
proxy (key never in shop code). Two deploy backends behind one interface
(D-P1, §4.1): **ScriptTarget** on a plain Workers account ($5/mo — starts
today, 500-shop cap, workers.dev auto-subdomains + per-shop custom domains,
Genlook proxy reached via baked service binding) and **DispatchTarget** on
Workers for Platforms ($25/mo — dispatch namespace + dynamic dispatch
Worker + outbound Worker + `*/*` wildcard KV routing, unlimited shops) when
scale or isolation demands it. Usage prices are identical on both
($0.30/M requests, $0.02/M CPU-ms); custom hostnames cost $0.10/hostname/
month beyond 100 included on any plan.

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
| D1 limits | `/d1/platform/limits/` (upd. 2026-04-21) | Per-tenant databases explicitly supported |
| Skill pack | `~/.agents/skills/cloudflare/references/workers-for-platforms/*` | Cross-checked against live docs; API shapes match |

Dashboard changelog (2025-12-18) adds: namespace creation, dispatch-worker
templates (path + subdomain), and tag management now exist as UI parity —
useful for manual debugging, but every flow the platform needs is API-first.

---

## 2. The four WfP components (as learned)

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
       or amina.crowdy.app   (our wildcard subdomain)
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

Question asked outright: can one platform Worker deploy other Workers
automatically using just an API access token, WITHOUT the $25 Workers for
Platforms subscription? Answer: **yes, via the plain Workers script API** —
with real trade-offs (mainly shop cap and egress interception). Verified
facts:

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
| B9 | Outbound-worker egress interception + per-tenant CPU limits (`limits:{cpuMs}` in dispatch props) are **WfP-only**. Substitute (we own the shop code): at deploy time bake a service binding `GENLOOK_PROXY → platform genlook-proxy worker` into the shop script, or have the wasm call `https://platform.crowdy.app/genlook/*` with its per-shop token. Functionally equivalent metering; loses the "third-party code" safety net, which we don't need. | docs `workers/platform/pricing` (Service bindings); WfP outbound-worker docs |
| B10 | `worker_loaders` (Dynamic Workers) confirmed available on plain Paid (third-party issue; not WfP-gated) — but still ephemeral → remains preview-only per §4. | github.com/jokull/agent-cms/issues/53 |

Three viable routes compared:

| | WfP $25/mo | Plain Free | Plain Paid $5/mo ← START HERE |
|---|---|---|---|
| Shop cap | 1000 scripts, +$0.02/each | 100 total | 500 total |
| Subdomain routing | dispatcher + KV (`*.crowdy.app`) | workers.dev per script | workers.dev per script + `/workers/domains` custom domains (100/zone) |
| Owner custom domains | CfS 50,000 hostnames | CfS (same flow) | CfS (same flow) |
| Per-shop D1 | 50k ✓ | **10 ✗** | 50k ✓ |
| Traffic included | 20 M req/mo | 100 k req/DAY account-wide | 10 M req/mo |
| 100 shops × 2 M req | $25 + ~$54 req+CPU ≈ **$79/mo** | impossible | $5 + ~$52 ≈ **$57/mo** |
| Untrusted isolation | yes | n/a | n/a (we ship the code) |
| Rolling deploys | all-at-once | gradual (versions) possible | gradual (versions) possible |

So for our early scale the "bypass" is also cheaper: one $5/mo plan instead
of $25. The WfP plan buys us: unlimited scripts (≈1100+ shops), KV-hostname
wildcard routing under `crowdy.app` without per-shop route churn, untrusted
isolation, outbound egress interception, and 2× the included traffic/CPU.

**Decision D-P1: the deployer gets two backends behind one interface** —
`ScriptTarget` (plain account, default; phases B–F build on this) and
`DispatchTarget` (WfP) — so switching later is a config change, not a
rewrite. CF-API client, D1-per-shop provisioner, bundle loader, and
metering are shared. Switch to WfP (buy in dashboard, self-serve per B1)
when any of: (a) ~400 shops (approaching 500 cap), (b) >100 custom domains
per zone, (c) seller-hosted third-party shop code (need untrusted mode).

What changes in script mode per phase:
- **Phase C**: deploy `shop-<id8>` as a normal script (multipart PUT) with
  bindings: per-shop `DB` (D1), shared `IMAGES` (R2 `{bucket_name:
  "tenant-images"}`), `GENLOOK_PROXY` service binding, `SHOP_ID` +
  `PLATFORM_TOKEN` vars. Tags via `/scripts/{name}/tags` (2 per call limits
  apply; keep the 3-tag convention). Verify `workers.dev` enablement via
  `/scripts/{name}/subdomain` endpoint at deploy time (Q8).
- **Phase D** shrinks: no runtime dispatcher needed. Platform registrar
  attaches Custom Domains (`PUT /workers/domains`) for
  `{{shop}}.crowdy.app` when a shop deploys; KV ROUTE_KV store becomes
  dashboard bookkeeping (host→shop) instead of a hot routing path. workers.dev
  auto-URL is the built-in fallback.
- **Phase E**: genlook-proxy is a plain sibling Worker with KV credit
  counters; shops reach it via the service binding metered as 1 request.
- **Phase G**: unchanged CfS flow for customer-owned domains (owner adds
  CNAME → `target.crowdy.app`).
- Free-plan note: usable as a **staging target** (100 scripts, but 100 k
  req/day + 10 D1 caps make tenant shops impossible there).

---

## 5. Limits to respect (all from the WfP limits page unless noted)

| Limit | Value | Impact on us |
|---|---|---|
| Scripts per namespace | unlimited | 1000 included in plan, rest $0.02 each |
| Tags per script | 8 | use `shop:<id>:yes`, `tier:<t>`, `env:<e>` |
| Gradual deployments | not supported for user Workers | redelopys are all-at-once |
| `request.cf` | unavailable (untrusted mode) | shop code must not use it (it doesn't) |
| `caches.default` | disabled | shop uses asset fetch + R2 only |
| API client rate | 1,200/5 min per user token | deployer queue + backoff |
| API per-IP | 200/s | same |
| GraphQL analytics | 320/5 min | dashboards must cache |
| Durable Object namespaces | no WfP limit | n/a |
| D1 databases per account | 10 free / 50,000 paid (expandable to millions) | **1 shop = 1 D1 OK** |
| D1 DB size | 10 GB paid / 500 MB free | per shop is plenty |
| Routes per zone | 1,000 normal | we use ONE wildcard route ✓ |
| Custom domains per zone (Worker custom domains) | 100 | we use CFfS hostnames instead (50,000) |

D1's own FAQ explicitly blesses the per-shop-database pattern ("per-user,
per-tenant databases, thousands at no extra cost"). The deployer creates a
D1 per shop at deploy time, applies the shop schema, then binds `{type:
"d1", name:"DB", id}` — zero changes to the shop's data model.

---

## 6. Routing: subdomains *and* custom domains

### 6.1 Subdomains (our master domain, e.g. `crowdy.app`) 

1. Zone `crowdy.app` in the SAME Cloudflare account as WfP.
2. DNS: `*` CNAME/A → dummy origin (`A 192.0.2.0`, proxied orange).
3. Route (Workers Routes): wildcard `*/*` on the zone → dispatcher.
4. Dispatcher: `sub = hostname.split(".")[0]` → KV lookup `host:{sub}.crowdy.app`
   → `DISPATCHER.get(scriptName, ...)`. `crowdy.app` itself (bare apex) is
   reserved by checking the subdomain count (2 dots) or an explicit exclude.

`*.saas.com/*` route is also documented for subdomain-only setups; we use
`*/*` so the SAME dispatcher later serves custom hostnames.

### 6.2 Custom domains (shop owner's `mystore.com`)

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
   - Owner adds `CNAME mystore.com → target.crowdy.app` (or TXT for DCV).
   - Platform polls `GET /zones/{zone}/custom_hostnames/{id}` until
     `status: active` (validation statuses documented; backoff schedule is a
     7-day routine) — the deploy UI shows the state.
3. Routing: when `status` becomes active (or on first record add), the
   dispatcher's KV gains `host:mystore.com → {scriptName, shopId}`.
4. O2O behaviour table (docs): with `*/*` the dispatcher is invoked no
   matter whether the owner's own zone is orange- or grey-clouded — this is
   why `*/*` is the docs recommendation and our choice.
5. Cost: $0.10/hostname/month after the 100 included; no per-plan feature
   we need до then is Enterprise-locked (we avoid `custom_metadata`).

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
(changelog 2025-07-23). Preview = `<tenant>.crowdy.app` + dispatch flag or a
separate staging namespace script name.

In ScriptTarget mode (§4.1) this inverts: every script DOES auto-get
`{{name}}.{{sub}}.workers.dev` (B3) — it becomes the default tenant URL plus
the automatic preview surface for version URLs. The docs still mark
workers.dev as "treated as a Free website ... not business-critical", so the
plan treats workers.dev as the fallback/beta URL and attaches a Custom
Domain (`{{shop}}.crowdy.app`) as the production URL.

---

## 7. Platform architecture (SaaSTryon)

### 7.1 Components & machine mapping

| Component | Worker (all in this workspace) | Bindings |
|---|---|---|
| Control plane (`platform/`) | signup, login, admin approval, deploy orchestration, domain/token requests, dashboard UI | platform D1, ROUTE_KV, BUNDLES (R2), secrets: CLOUDFLARE_API_TOKEN, ADMIN_TOKEN, GENLOOK_API_KEY (for grant accounting) |
| Dispatcher (`edge/`) | one route; hostname→shop, limits, suspension | DISPATCHER (dispatch_namespaces), ROUTE_KV, PLATFORM_DB (read), SECRETS none |
| Outbound (`outbound/`) | egress interceptor + Genlook key injection + quota enforcement | PLATFORM_DB (read/write), secrets: GENLOOK_API_KEY |
| Shop user worker (deployed copies) | existing tryon shop (Rust wasm) + per-shop bindings | DB (D1), PRODUCTS (R2), ASSETS, SHOP_ID, PLATFORM_TOKEN |

All four live in one Cloudflare account. `crowdy.app` zone hosts dispatcher
route + custom hostnames. The deployed shops get their own D1 (isolation),
share `tenant-images` R2 bucket (key prefix `shops/<shopId>/…` — R2 bucket
count is a practical cap; per-tenant buckets v2 if needed) and share
platform `ASSETS`.

### 7.2 Platform D1 schema (draft)

```sql
users(id, email TEXT UNIQUE, contact TEXT, status,          -- pending|approved|suspended
      deploy_allowance INT DEFAULT 0, deploy_used INT DEFAULT 0,
      created_ms, approved_by, note)
shops(id, owner_id, name, subdomain TEXT UNIQUE,          -- amina → amina.crowdy.app
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
3. provision: D1 create + schema (worker `DB`), slot in shared R2
4. generate PLATFORM_TOKEN (random secret_text per shop)
5. fetch bundle from R2 (manifest → parts), compute asset hashes
6. CF API: (a) assets session/upload; (b) PUT user worker
   script `shop-<id8>` with bindings + tags
7. KV: `host:<sub>.crowdy.app` -> {script, shopId}
8. record shop cluster_id (script name), audit, decrement allowance
response → shop live at https://<sub>.crowdy.app
```

Idempotency: re-PUT overwrites the script in place (docs behaviour) — support
"redeploy on new bundle version" with the same script name and
`keep_bindings`; version rollbacks = keep R2 bundle history, re-upload.

### 7.4 Genlook proxy + token limits (the shop never holds the key)

- Shops call Genlook over plain `fetch()`; the **outbound worker sees every
  call** (configured via the dispatch namespace binding `outbound` +
  `parameters: ["tenant"]`; dispatcher passes `tenant: {shopId, requestId}`).
- Outbound worker logic: if URL host == Genlook → inject
  `GENLOOK_API_KEY` (secret never bound to shops), check
  `credits.granted - credits.used > 0` (D1, cheap point read; hard-cap CPU
  with `limits:{cpuMs}` per tier), forward, decrement/use counters; the
  shop's existing `GET /tryon/v1/account/credits` response is rewritten by
  the outbound worker OR by the shop's miss-redirect to the platform (v1:
  outbound rewrites the body so the shop UI keeps working untouched).
- Costs/quota granularity: 1 try-on ≈ 1 token balance unit; grants are rows
  in `credits`. Every call lands in `_workers-outbound` analytics + optional
  Analytics Engine data points (`index: shopId`) for the owner dashboard.
- Non-Genlook egress: allow `platform API host` (for credit self-service +
  product image uploads to R2 presigned URLs if we add them), **403
  everything else** in v1 (egress allow-list; docs show the deny-anything
  else pattern).

### 7.5 Shop-side extension (settings page asks the platform for more)

The tryon dashboard gets a new "Platform" card/contact in the owner settings
(built into `frontend/`): "Request more try-on tokens" + "Connect my
domain". Both call the platform control plane:

```
POST https://<platform>/platform/v1/shops/me/credit-request   {amount, reason}
POST https://<platform>/platform/v1/shops/me/domains          {hostname}
Auth: `Authorization: Bearer <PLATFORM_TOKEN>` (secret_text binding)
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
  (dispatcher blocks hostname → 403 "This shop is suspended"), can cancel
  (delete-by-tag script deletion).
- Rate limits: simple D1 counters + KV cached plan lookups; deep analytics
  later through GraphQL per dispatch namespace (doc: `GraphQL
  workersInvocationsAdaptive` filter `dispatchNamespaceName`).

---

## 8. Open questions / risks (check before/while building)

| # | Question | How to resolve |
|---|---|---|
| Q1 | Exact multipart shape for uploading a wasm user worker (`web_assembly` binding vs `application/wasm` part) inside a dispatch namespace | throwaway deploy on the $25 account; REST + SDK trial |
| Q2 | Does WfP plan purchase have any account prerequisite (paid Workers plan?) | dashboard shows buy flow; verify before spending |
| Q3 | R2 bucket count per account cap (shared `tenant-images` strategy) | check dashboard limits page or create-limits |
| Q4 | KV eventual-consistency window affecting new-hostname routing (first seconds after deploy) | dispatcher: on miss, degrade to script-name-from-host guess + retry |
| Q5 | `keep_bindings` semantics when re-adding the FULL binding set each deploy | tests in staging namespace; always send full set + keep_bindings |
| Q6 | Asset hash salting needed only if tenant-special themes ever arrive | revisit if themes ship |
| Q7 | Live pricing surprise (e.g. asset upload pricing changed Oct 2026 per banner) | re-read the live pricing page before card charge |
| Q8 | REST call to ENABLE `workers.dev` for a freshly uploaded script script (wrangler relies on config; API shape = `POST /scripts/{name}/subdomain {enabled}`?) | probe on staging account before first scripted deploy |
| Q9 | Minimal API-token scopes for script-mode deploys (Workers Scripts Edit + D1 Edit + KV Edit + Zone/DNS? for `/workers/domains` custom domains) | trial token on the staging account; least-privilege per B2 |
| Q10 | Whether `/workers/domains` requires the zone in the same account (B6 implies yes) and what happens for shops with a pending cert on `{{shop}}.crowdy.app` | staging probe in Phase D |
| Q11 | Script tags endpoint limits (`/scripts/{name}/tags`, PUT 2 tags per call?) vs namespace upload's inline tags | probe; keep 3-tag convention either way |

## 9. Build order (phases)

| Phase | Deliverable | Tests / proof |
|---|---|---|
| A (done) | This doc + folder scaffold + template cloned | doc review |
| B | `platform/`: wrangler config, D1 migrations, signup/login/approval/allowance (admin UI pages using tryon design language), REST contracts frozen | vitest-pool-workers: ≥5 tests (signup, pending, approve, allowance gate, auth guard) |
| C | `platform/deploy`: bundle loader, D1-per-shop provisioner, CF API client with queue+backoff, tags; `DeploymentTarget` interface with `ScriptTarget` first (§4.1 D-P1), `DispatchTarget` later; local mock of CF endpoints | unit tests on manifest parsing, idempotent deploy vs mock; live smoke deploy only once account set up (ask before spending) |
| D | `edge/` — script mode = hostname registrar (`PUT /workers/domains` + KV bookkeeping); dispatch mode = runtime dispatcher, kept behind the target interface | vitest stubs + staging probe (Q8/Q10) |
| E | `outbound/`: Genlook allow-list + key injection + per-shop metering + credits rewriting | unit; staging namespace end-to-end |
| F | tryon shop changes: acceptance of `SHOP_ID` prop, R2 key prefixes `shops/<id>/`, Settings card → platform API calls; deploy UI in platform | browser probes; frontend commit per usual tryon rules |
| G | Custom domains (CFfS) self-serve + "buy tokens" flow behind admin/manual billing flag | API contract + staging hostname |
| H | Hardening: rollout dashboards (GraphQL), Logpush/observability, D1 backups | |

Sequencing rule (AGENTS.md compliant): each phase ends with
`tsc/bun-check` + `bun test` + browser probe if UI changed; Rust side keeps
its own ram-check/ram-test rules and is never built on this machine.
