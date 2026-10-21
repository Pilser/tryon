# SHOP-API.md — the SaaSTryon platform API and the deployed shop API

Complete API reference for:

- **the platform** (the control plane, one Worker on the apex host) — `https://latiforge.com/api/v1/*`
- **a deployed shop** (one tenant Worker per customer) — `https://{sub}.latiforge.com/*`

Every path, body field and answer shape below is taken from the Rust
sources, not from the other docs:

| Concern | Source of truth |
|---|---|
| Platform router (the endpoint list) | `SaaSTryon/platform/src/http.rs` |
| Platform handlers | `SaaSTryon/platform/src/{auth,admin,deploy,domain,landing,credits,dashboard,outbound,shops,store}.rs` |
| The deploy flow, bindings, domain attach | `SaaSTryon/platform/src/deployer/{mod,provision,domain}.rs` |
| Shop routes | `worker/src/lib.rs`, `worker/src/routes/*.rs` |
| Platform UI calls | `SaaSTryon/platform/frontend/src/api.ts` |
| Shop UI calls | `frontend/src/core/api.ts` |

Related documents (do not repeat them here):

- [`Deploy.md`](./Deploy.md) — how to ship: CI, the deploy script, the bundle layout, the R2 layout, the Phase G calls.
- [`PLATFORM.md`](./PLATFORM.md) — the architecture and the live findings in §10 (things that cost a deploy cycle each).

---

## 0. How to read this

### 0.1 Four credentials, four call surfaces

| Credential | Where it comes from | Header | What it opens |
|---|---|---|---|
| **Owner session** | `POST /api/v1/login` → `session_id` (a `sess_…` id in D1, 30-day TTL) | `Authorization: Bearer <session_id>` | the owner half of the platform API: `/api/v1/me`, `/deploy`, `/shop/domain`, `/shop/landing*`, `/shops*` |
| **Admin token** | the platform's `ADMIN_TOKEN` env secret (fail-closed: unset ⇒ every admin route is 401) | `Authorization: Bearer $ADMIN_TOKEN` | every `/api/v1/admin/*` route |
| **Shop token** (`PLATFORM_TOKEN`) | minted per deploy (`deploy_` + 16 hex), stored in `shops.platform_token`, bound into the shop worker as a `secret_text` binding | `Authorization: Bearer deploy_…` | the shop-facing platform routes: `/api/v1/shop/tokens/redeem`, `/api/v1/shop/credits/request`, `/api/v1/shop/genlook/*` |
| **Shop owner token** (`OWNER_TOKEN`) | the shop worker's own env secret — **not** the same thing as the platform's `PLATFORM_TOKEN` | `Authorization: Bearer <OWNER_TOKEN>` | the shop's owner routes: `/api/studio/*`, `/api/owner/*` |

The signin token (`plat_` + 16 hex) is a **third**, one-shot credential: it is
shown once in the admin UI at approval time and exchanged for a session at
`POST /api/v1/login`. It is never a Bearer credential.

Rules that follow from the table:

- A platform owner session never calls a shop route, and a shop token never
  calls an owner route.
- The shop's `OWNER_TOKEN` is **not** bound by the platform deployer (see
  §6, finding F4). A platform-deployed shop that has no `OWNER_TOKEN` has an
  **open** owner API (`owner::authorized` treats an empty expected token as
  "allowed").
- The Genlook API key is never in a shop script. The shop reaches Genlook
  through the platform proxy (§1.11).

### 0.2 Conventions

- Platform API: everything lives under `/api/v1/`. Any other path on the
  platform host is a static asset (the React frontend) served by the
  `ASSETS` binding; when that binding is missing the platform answers
  `404 NO_FRONTEND` and the API keeps working.
- The platform speaks JSON only. `POST /api/v1/shop/landing/file` is the one
  multipart route (a file part named `file`).
- The shop speaks JSON, plus multipart on `/api/person-upload`,
  `/api/studio/products`, `/api/studio/categories`, `/api/studio/shop`, and
  a raw image body on `/api/device/photos`.
- Errors are **never** a bare 200 and never a plain-text body: both APIs
  answer `{"code": …, "message": …, "status": …}` with the matching HTTP
  status. Branch on `code`; show `message` to humans.
- Answer field names are snake_case exactly as the Rust structs define them.
- `Bearer` is case-sensitive and the scheme is followed by one space.

### 0.3 Host names used in the examples

```bash
PLATFORM=https://latiforge.com        # the control plane (apex)
SHOP=https://my-shop.latiforge.com     # a deployed tenant
```

---

## 1. Platform API (control plane)

Base: `$PLATFORM/api/v1`.

### 1.1 Accounts and session

#### `POST /api/v1/signup`

| | |
|---|---|
| Auth | public |
| Body | `{"email": string, "contact": string, "shop_name": string?}` |

`contact` is normalised to digits (a leading `+` is kept) and must end up
with 7–20 digits. `email` is lower-cased and trimmed. `shop_name` max 80
characters; when present it also reserves the matching subdomain
(`"Amina Studio"` ⇒ `amina-studio` is taken for everyone else).

**Answer 200**

```json
{ "status": "pending" }
```

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | `BAD_JSON` | body is not JSON / not the expected shape |
| 400 | `BAD_EMAIL` | email does not look deliverable |
| 400 | `BAD_CONTACT` | fewer than 7 digits |
| 400 | `BAD_SHOP_NAME` | longer than 80 characters |
| 409 | `EMAIL_TAKEN` | that email already signed up |

```bash
curl -s -X POST "$PLATFORM/api/v1/signup" \
  -H 'content-type: application/json' \
  --data '{"email":"amina@example.com","contact":"+256772000111","shop_name":"Amina Studio"}'
```

#### `POST /api/v1/login`

| | |
|---|---|
| Auth | public (the `plat_…` token in the body is the credential) |
| Body | `{"token": string}` |

**Answer 200**

```json
{
  "session_id": "sess_1a2b3c4d5e6f7081",
  "user": {
    "id": "usr_1a2b3c4d5e6f7081",
    "email": "amina@example.com",
    "contact": "+256772000111",
    "shop_name": "Amina Studio",
    "status": "approved",
    "deploy_allowance": 3,
    "deploy_used": 1,
    "created_ms": 1760000000000,
    "approved_by": "admin"
  }
}
```

The `plat_…` token is never echoed back.

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | `BAD_JSON` | body is not JSON |
| 400 | `BAD_TOKEN` | `token` is empty |
| 401 | `UNAUTHORIZED` | no user has that token (only its SHA-256 hash is stored) |
| 403 | `NOT_ACTIVE` | the user exists but is not `approved` |

```bash
curl -s -X POST "$PLATFORM/api/v1/login" -H 'content-type: application/json' \
  --data '{"token":"plat_1a2b3c4d5e6f7081"}'
```

#### `GET /api/v1/me`

| | |
|---|---|
| Auth | owner session |

**Answer 200** — `{"user": UserView, "deploy_allowance": i64, "deploy_used": i64}`.

```json
{
  "user": {
    "id": "usr_1a2b3c4d5e6f7081",
    "email": "amina@example.com",
    "contact": "+256772000111",
    "shop_name": "Amina Studio",
    "status": "approved",
    "deploy_allowance": 3,
    "deploy_used": 1,
    "created_ms": 1760000000000,
    "approved_by": "admin"
  },
  "deploy_allowance": 3,
  "deploy_used": 1
}
```

**Errors**: 401 `UNAUTHORIZED` (no/expired session), 403 `SUSPENDED` /
`REJECTED` / `NOT_ACTIVE` (the account is not approved).

```bash
curl -s "$PLATFORM/api/v1/me" -H "authorization: Bearer $SESSION"
```

#### `POST /api/v1/revoke`

| | |
|---|---|
| Auth | owner session (optional — a stale token still answers 200) |

**Answer 200** — `{"ok": true}`. The session row is deleted. Always 200:
there is nothing left to revoke.

```bash
curl -s -X POST "$PLATFORM/api/v1/revoke" -H "authorization: Bearer $SESSION"
```

### 1.2 Deploy

#### `POST /api/v1/deploy`

| | |
|---|---|
| Auth | owner session (the user must be `approved`) |
| Body | `{"subdomain": string, "shop_name": string?, "tier": string?}` |

`subdomain` is trimmed and lower-cased; `tier` defaults to `starter`;
`shop_name` defaults to the user's signup `shop_name`.

**What one call does** (`deployer::deploy_shop`):

1. validate the subdomain (`cfg::valid_subdomain`: 3–63 chars of
   `[a-z0-9-]`, no leading/trailing hyphen, not reserved) and check the
   claim (any shop row **or** any other user's normalised signup
   `shop_name` blocks the label);
2. gate the owner: `status == approved` **and**
   `deploy_used < deploy_allowance` (one deploy costs one allowance);
3. create the per-shop D1 database (`shop-<id8>`) and apply the bundled
   shop schema to it in one batched query call;
4. mint the shop's `PLATFORM_TOKEN` (`deploy_` + 16 hex);
5. stage the bundle's assets (asset session → upload the missing hashes →
   completion jwt) and PUT the script `shop-<id8>` with the bindings;
6. attach `{sub}.{CF_ZONE_NAME}` to the script
   (`PUT /accounts/{id}/workers/domains` — DNS + certificate are created by
   Cloudflare);
7. write the `shops` row (`status = live`), append an audit row, decrement
   the owner's allowance.

**Bindings the shop script gets** (exactly six, in this order):

| # | type | name | value |
|---|---|---|---|
| 1 | `d1` | `DB` | the per-shop database uuid |
| 2 | `r2_bucket` | `PRODUCTS` | the shared `tenant-images` bucket |
| 3 | `plain_text` | `SHOP_ID` | `<id8>` (R2 key prefix `shops/<id8>/`) |
| 4 | `secret_text` | `PLATFORM_TOKEN` | the per-shop `deploy_…` secret |
| 5 | `plain_text` | `R2_PUBLIC_BASE` | `https://{host}/media` |
| 6 | `assets` | `ASSETS` | the shop's own static assets |

No Genlook key and no service binding ever reaches a shop script.

**Answer 200**

```json
{
  "ok": true,
  "shop_id": "shop_1a2b3c4d",
  "subdomain": "my-shop",
  "url": "https://my-shop.latiforge.com",
  "workers_dev_url": "https://shop-1a2b3c4d.workers.dev"
}
```

`url` is the custom domain when the attach worked, else the workers.dev
fallback. `workers_dev_url` is `null` when no workers.dev subdomain is
configured for the account.

**Errors**

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHORIZED` | no session / no session user |
| 400 | `BAD_JSON` | body is not JSON |
| 400 | `BAD_SUBDOMAIN` | empty, too short/long, bad charset, or a reserved label (`www`, `app`, `api`, `admin`, `shop`, …) |
| 400 | `OWNER_MISSING` | the session points at a user that no longer exists |
| 402 | `NO_ALLOWANCE` | `deploy_used >= deploy_allowance` |
| 403 | `NOT_APPROVED` | the account is `pending`, `suspended` or `rejected` |
| 409 | `SUBDOMAIN_TAKEN` | another shop or signup claims the label |
| 500 | `NO_BUNDLE` | the `BUNDLE_ID` env var is empty — no released bundle configured |
| 500 | `BUNDLE_FAILED` | the bundle could not be loaded/verified |
| 500 | `STORE_FAILED` | the platform D1 write failed |
| 502 | `CF_FAILED` | a Cloudflare API call failed |

```bash
curl -s -X POST "$PLATFORM/api/v1/deploy" \
  -H "authorization: Bearer $SESSION" -H 'content-type: application/json' \
  --data '{"subdomain":"my-shop","shop_name":"My Shop","tier":"starter"}'
```

### 1.3 The customer's own domain

#### `POST /api/v1/shop/domain`

| | |
|---|---|
| Auth | owner session |
| Body | `{"domain": string, "shop_id": string?}` |

The free path: the customer owns the zone on Cloudflare and adds this
Cloudflare account as a **collaborator** on it. The platform looks the zone
up (`GET /zones?name=<domain>`), keeps only a zone whose `account.id` is
ours, and attaches the hostname with
`PUT /accounts/{account}/workers/domains` (`zone_id`, `hostname`,
`service = shops.cluster_id`, `environment = production`). Cloudflare
creates the DNS record in the customer's zone and issues the certificate.

`shop_id` picks one of the owner's shops; without it the **newest** shop is
used.

**Answer 200**

```json
{
  "ok": true,
  "hostname": "myshop.com",
  "url": "https://myshop.com",
  "zone": "myshop.com"
}
```

**Errors**

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHORIZED` | no session |
| 400 | `BAD_JSON` | body is not JSON |
| 400 | `BAD_DOMAIN` | not a bare hostname (no scheme, no path, no port, no wildcard, ≥ 2 labels) |
| 404 | `NO_SHOP` | the owner has no shop (or the given `shop_id` is not theirs) |
| 409 | `OUR_DOMAIN` | `latiforge.com` or a subdomain of it — that is our own zone |
| 409 | `ZONE_NOT_OURS` | the zone is not in this Cloudflare account (another registrar, or no collaborator) |
| 500 | `NO_CF` | the platform's Cloudflare config is incomplete (missing `CLOUDFLARE_API_TOKEN` / `CF_ACCOUNT_ID`) |

```bash
curl -s -X POST "$PLATFORM/api/v1/shop/domain" \
  -H "authorization: Bearer $SESSION" -H 'content-type: application/json' \
  --data '{"domain":"myshop.com"}'
```

### 1.4 The customer's landing page

The shop's static surface is served by the shop script's `ASSETS`
binding, so a landing page is just more assets: the customer's `dist` is
uploaded here, stored in R2, and published by re-registering the shop's
asset manifest.

R2 layout (bucket `BUNDLES`):

```
landings/<shop_id>/manifest.json      {"files":[{"path":"/index.html","key":"…"}]}
landings/<shop_id>/files/index.html   the bytes
```

#### `POST /api/v1/shop/landing/file?path=<path>[&shop_id=<id>]`

| | |
|---|---|
| Auth | owner session |
| Type | multipart/form-data, one file part named `file` |
| Query | `path` = the file's place in the dist; `shop_id` optional |

Path rules (`landing_path`): trimmed, leading `/` dropped, then re-prefixed
with `/`. `/` or empty ⇒ `/index.html`. Allowed characters are
`[A-Za-z0-9.\-_/]`, max 200 characters, no `..`, no `//`.

One file per call, max **5 MB** per file.

**Answer 200**

```json
{ "ok": true, "path": "/index.html", "files": 3 }
```

`files` is the number of files in the manifest after this upload.

**Errors**

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHORIZED` | no session |
| 400 | `BAD_PATH` | the path breaks the rules above |
| 400 | `NO_FILE` | no part named `file` |
| 400 | `TOO_BIG` | the file is over 5 MB |
| 404 | `NO_SHOP` | the owner has no shop |

```bash
curl -s -X POST "$PLATFORM/api/v1/shop/landing/file?path=%2Findex.html" \
  -H "authorization: Bearer $SESSION" -F "file=@dist/index.html"
```

#### `POST /api/v1/shop/landing/apply`

| | |
|---|---|
| Auth | owner session |
| Body | `{"shop_id": string?}` (empty body `{}` is fine) |

The publish step: bundle assets (under `/app/…`) **plus** the landing files
(at `/`) become one asset set, the missing files are uploaded (Cloudflare
transfers only what it does not have), and the script is re-PUT with the
new asset set — the bindings and the shop's `PLATFORM_TOKEN` are re-sent
unchanged, so the shop keeps working.

**Answer 200**

```json
{
  "ok": true,
  "files": 3,
  "uploaded": 0,
  "url": "https://my-shop.latiforge.com"
}
```

`uploaded` is the number of asset buckets actually transferred — `0` on a
re-publish of unchanged files.

**Errors**

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHORIZED` | no session |
| 400 | `BAD_JSON` | body is not JSON |
| 400 | `NO_FILES` | nothing was uploaded yet |
| 404 | `NO_SHOP` | the owner has no shop |
| 500 | `NO_CF` | the platform's Cloudflare config is incomplete |
| 500 | `NO_BUNDLE` | the shop's bundle could not be loaded from R2 |
| 500 | `LANDING` | the landing files could not be read from R2 |
| 502 | `ASSETS` | the asset staging failed |
| 502 | `CF_FAILED` | the script PUT failed |

```bash
curl -s -X POST "$PLATFORM/api/v1/shop/landing/apply" \
  -H "authorization: Bearer $SESSION" -H 'content-type: application/json' --data '{}'
```

#### `GET /api/v1/shop/landing`

| | |
|---|---|
| Auth | owner session |

**Answer 200** — one entry per shop of the owner (the dashboard shows them
all).

```json
{
  "ok": true,
  "shops": [
    {
      "shop_id": "shop_1a2b3c4d",
      "subdomain": "my-shop",
      "url": "https://my-shop.latiforge.com",
      "files": ["/index.html", "/styles.css", "/app.js"]
    }
  ]
}
```

**Errors**: 401 `UNAUTHORIZED`.

```bash
curl -s "$PLATFORM/api/v1/shop/landing" -H "authorization: Bearer $SESSION"
```

### 1.5 Shop tokens (the 4-digit codes)

The admin mints 4-digit codes; a shop redeems one to top up its
`tryon_tokens` balance. One code = one try-on credit.

#### `POST /api/v1/shop/tokens/redeem`

| | |
|---|---|
| Auth | **shop token** (`PLATFORM_TOKEN`) — the shop is looked up by that secret |
| Body | `{"code": string}` |

**Answer 200**

```json
{
  "token": {
    "code": "0421",
    "shop_id": "shop_1a2b3c4d",
    "status": "used",
    "created_ms": 1760000000000,
    "redeemed_ms": 1760000005000,
    "redeemed_by": "shop_1a2b3c4d",
    "cancelled_ms": null,
    "note": "batch jan"
  },
  "shop_id": "shop_1a2b3c4d"
}
```

**Errors**

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHORIZED` | no bearer, or no shop has that `PLATFORM_TOKEN` |
| 400 | `BAD_JSON` | body is not JSON |
| 500 | (rust error, not a JSON envelope) | the code is unknown, already used or cancelled — `redeem_shop_token` returns `Err`, which the worker turns into a 500 |

```bash
curl -s -X POST "$PLATFORM/api/v1/shop/tokens/redeem" \
  -H "authorization: Bearer $PLATFORM_TOKEN" -H 'content-type: application/json' \
  --data '{"code":"0421"}'
```

### 1.6 Credits (the manual billing gate)

A shop asks for more credits, an admin approves; the credits land in the
same `credits` ledger the Genlook proxy meters against.

#### `POST /api/v1/shop/credits/request`

| | |
|---|---|
| Auth | **shop token** |
| Body | `{"requested": i64, "reason": string?}` — `requested` is 1…10000 |

**Answer 200**

```json
{
  "ok": true,
  "request": {
    "id": "cr_1a2b3c4d5e6f7081",
    "shop_id": "shop_1a2b3c4d",
    "requested": 100,
    "reason": "launch week",
    "status": "pending",
    "decided_by": null,
    "created_ms": 1760000000000
  }
}
```

**Errors**

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHORIZED` | no bearer / unknown shop |
| 400 | `BAD_JSON` | body is not JSON |
| 400 | `BAD_AMOUNT` | `requested` outside 1…10000 |

```bash
curl -s -X POST "$PLATFORM/api/v1/shop/credits/request" \
  -H "authorization: Bearer $PLATFORM_TOKEN" -H 'content-type: application/json' \
  --data '{"requested":100,"reason":"launch week"}'
```

#### `GET /api/v1/admin/credits`

| | |
|---|---|
| Auth | admin token |

**Answer 200** — `{"requests": [CreditRequest]}` (pending only, newest
first, max 200).

```json
{
  "requests": [
    {
      "id": "cr_1a2b3c4d5e6f7081",
      "shop_id": "shop_1a2b3c4d",
      "requested": 100,
      "reason": "launch week",
      "status": "pending",
      "decided_by": null,
      "created_ms": 1760000000000
    }
  ]
}
```

**Errors**: 401 `UNAUTHORIZED`.

```bash
curl -s "$PLATFORM/api/v1/admin/credits" -H "authorization: Bearer $ADMIN_TOKEN"
```

#### `POST /api/v1/admin/credits/approve`

| | |
|---|---|
| Auth | admin token |
| Body | `{"id": string}` |

Grants `row.requested` credits to the shop and closes the request in one
step. The state check runs **before** the write, so a double approve cannot
grant twice.

**Answer 200** — `{"ok": true, "granted": 100, "shop_id": "shop_1a2b3c4d"}`.

**Errors**

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHORIZED` | not the admin |
| 400 | `BAD_JSON` | body is not JSON |
| 404 | `NOT_FOUND` | unknown request id |
| 409 | `ALREADY_DECIDED` | the request is no longer `pending` |

```bash
curl -s -X POST "$PLATFORM/api/v1/admin/credits/approve" \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  --data '{"id":"cr_1a2b3c4d5e6f7081"}'
```

#### `POST /api/v1/admin/credits/reject`

| | |
|---|---|
| Auth | admin token |
| Body | `{"id": string, "reason": string?}` |

**Answer 200** — `{"ok": true}`. `decided_by` becomes `admin` or
`admin: <reason>`.

**Errors**: 401 `UNAUTHORIZED`, 400 `BAD_JSON`, 404 `NOT_FOUND`,
409 `ALREADY_DECIDED`.

```bash
curl -s -X POST "$PLATFORM/api/v1/admin/credits/reject" \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  --data '{"id":"cr_1a2b3c4d5e6f7081","reason":"out of stock"}'
```

### 1.7b Admin: the control plane over a shop (Phase H)

Every endpoint below is ADMIN_TOKEN only and takes the shop id in the
path (`shops.id`, e.g. `shop_327a7e32`).

| Endpoint | Body | Answer |
|---|---|---|
| `PATCH /api/v1/admin/shops/{id}` | `{name?, tier?, status?}` | `{ok, id, name, tier, status}` |
| `DELETE /api/v1/admin/shops/{id}` | — | `{ok, deleted, removed:[...]}` |
| `POST /api/v1/admin/shops/{id}/redeploy` | `{bundle_id}` | `{ok, shop_id, url}` |
| `POST /api/v1/admin/shops/{id}/tokens` | `{count?, note?, credits?}` | `{ok, tokens:[ShopToken]}` - `credits` is the face value (how many try-on credits the code buys when redeemed, default 1) |
| `POST /api/v1/admin/shops/{id}/owner-token` | `{token?}` | `{ok, shop_id, owner_token, url}` - SET the studio token by hand. Without a token the platform mints a typeable one (`studio-` + 8 unambiguous characters). The shop is redeployed with it: the old token dies, the data stays. |
| `POST /api/v1/admin/tokens/{code}/delete` | — | `{ok, deleted}` |
| `GET /api/v1/admin/bundles` | — | `{bundles:["v0.9.52", ...]}` |
| `GET /api/v1/admin/tryon-api` | — | `{configured, balance, source, message}` - the TRY-ON API's own balance (the provider account the generations spend). `configured:false` until the key is set. |
| `POST /api/v1/admin/tryon-api` | `{api_key}` | `{ok, configured, tail}` - the operator sets the try-on API key. It lands in the platform database (`platform_settings`) and is read on every call, so it is live on the next request - **no redeploy, no isolate restart**. An empty value clears it. The key is never echoed back (only its last four characters). |
| `POST /api/v1/admin/users/{id}/token` | `{token}` | `{ok, user_id, email, token}` - the admin sets (or rotates) a user's sign-in token by hand. 8-64 letters, digits, dash or underscore. Only the hash is stored. |
| `POST /api/v1/admin/platform/redeploy` | — | `{ok, script, version}` - the platform redeploys **itself** from the copy it keeps in R2 (`platform/self/*`). A new script version spawns fresh isolates, which is the cure for a poisoned one. |
| `POST /api/v1/admin/bundles?version=<label>` | multipart, every file under the field name `file` (the file name is its path inside the bundle) | `{ok, version, files:[...]}` |
| `POST /api/v1/admin/bundles/{version}/deploy-all` | — | `{ok, version, results:[{shop_id, ok, url?, error?}]}` - every shop moves to that bundle |

**The bundle layout matters**: the files keep the paths they have inside
the bundle (`manifest.json`, `shop.wasm`, `worker.js`, `shop-schema.sql`
and `assets/**`). Pick the BUNDLE ROOT folder in the admin, not the
`assets` folder inside it - the deployer looks for
`bundles/<version>/assets/<path>`.

**The studio token** (the owner's secret for `/app`) is visible in the
admin's shop view. Rotating it redeploys the shop: the script is sent
again with the new secret, and the products, the credits and the
landing files stay.

**`DELETE` is total**: the Worker script, the per-shop D1, the custom
domains, the shop's images in the shared bucket, its landing files and
its rows (shops, hostnames, credits, codes, credit requests, audit) are
all removed. There is no undo — the UI asks for the shop name to be
typed before it fires.

A **redeploy** re-sends the script of the shop and keeps its database,
its images and its data; only the bundle changes. The owner can do the
same for their own shop:

| Endpoint | Auth | Body |
|---|---|---|
| `GET /api/v1/shop/bundles` | owner session | — |
| `POST /api/v1/shop/redeploy` | owner session | `{bundle_id}` |
| `POST /api/v1/shop/tokens` | owner session | `{count?, note?, credits?}` - a code that belongs to the shop from the start |
| `POST /api/v1/shop/tokens/claim` | owner session | `{code, shop_id?}` - the owner takes a code the admin gave them; the code becomes bound to their shop and buys its credits. A code that already belongs to another shop is never stolen (`400 TOKEN_BOUND`). |
| `POST /api/v1/shop/owner-token` | owner session | `{token?}` - the owner sets their own studio token (the one they type into `/app`). Without a token the platform mints a typeable one. |
| `GET /api/v1/shop/codes` | owner session | — - `{codes:[ShopToken], credits_from_codes}`: the owner's own ledger, used codes included |

**The studio token** (the owner's secret for `/app`) is set BY HAND in
both portals. The rules: 8 to 64 characters of letters, digits, `-`
and `_`. The platform mints `studio-` + eight characters from an
alphabet without `0/O/1/I`, so it can be typed without a second look.
A **redeploy keeps the shop's token** (the owner must not lose their
studio login because the admin moved the shop to another bundle);
setting a token redeploys the shop, and the old one dies at once.

**The codes carry a value.** `credits` is set at mint time (admin or
owner) and the redemption grants exactly that many try-on credits.
The shop's studio shows the split ("26 credits reached this shop
through the admin codes it redeemed") - the shop asks the platform for
it at `GET /api/v1/shop/credits` with its cluster secret
(`PLATFORM_TOKEN`), and the shop worker proxies it at
`GET /api/studio/credits/platform`.

**The sign-in tokens are the admin's to give.** The approve call takes
an optional `token` - when the admin types one, that exact value
becomes the owner's login token (8-64 letters, digits, dash or
underscore); without one the platform mints a readable
`plat-XXXXXXXX` (no 0/O/1/I). The same value can be set or rotated
later with `POST /api/v1/admin/users/{id}/token`.

**A replaced photo gets a new URL.** A product photo keeps its R2 key
(one file per slot), so the URL would stay the same and the browser
would serve the cached image - the owner's "update" would look
refused. The saved URL carries a version stamp (`?v=<stamp>`), so a
replaced photo is fetched again.

That answer carries **only what is the shop's**: `{shop_id, from_codes,
codes_redeemed, codes[]}`. The platform's bookkeeping (the granted/used
totals) is not part of it - a shop does not read the platform's ledger,
and the admin reads it on `/admin/shops`. The provider account's balance
belongs to the admin alone (`/admin/tryon-api`).

**Codes** (the 4-digit platform codes) move in three steps:

| Action | Endpoint | Effect |
|---|---|---|
| mint for a shop | `POST /api/v1/admin/shops/{id}/tokens` (admin) or `POST /api/v1/shop/tokens` (owner) | the code is bound to the shop from the start (it can no longer be redeemed by someone else) |
| freeze | `POST /api/v1/admin/tokens/cancel` | status `cancelled` — the row stays, the code stops working |
| delete | `POST /api/v1/admin/tokens/{code}/delete` | the row is gone for good |

A shop's codes are listed with `GET /api/v1/admin/tokens` (each row
carries `shop_id`), and the owner sees theirs in the shop card.

### 1.8 Dashboard views

#### `GET /api/v1/shops`

| | |
|---|---|
| Auth | owner session |

**Answer 200** — `{"shops": [ShopView]}`.

```json
{
  "shops": [
    {
      "id": "shop_1a2b3c4d",
      "name": "My Shop",
      "subdomain": "my-shop",
      "url": "https://my-shop.latiforge.com",
      "domain": "myshop.com",
      "hostnames": ["my-shop.latiforge.com", "myshop.com"],
      "status": "live",
      "tier": "starter",
      "bundle": "v0.9.99",
      "created_ms": 1760000000000,
      "credits_granted": 100,
      "credits_used": 12,
      "credits_left": 88,
      "tokens_redeemed": 3,
      "landing_files": ["/index.html"],
      "activity_count": 7,
      "owner_email": null,
      "owner_name": null
    }
  ]
}
```

`owner_email` / `owner_name` are filled **only** in the admin view. `url` is
`https://{sub}.{CF_ZONE_NAME}` (falling back to `{sub}.workers.dev` when
the zone name is unset — see §6, finding F6).

**Errors**: 401 `UNAUTHORIZED`.

```bash
curl -s "$PLATFORM/api/v1/shops" -H "authorization: Bearer $SESSION"
```

#### `GET /api/v1/shops/activity`

| | |
|---|---|
| Auth | owner session |

**Answer 200** — `{"activity": [AuditRow]}`, newest first (100 rows per
shop, merged and re-sorted).

```json
{
  "activity": [
    {
      "id": "aud_1a2b3c4d5e6f7081",
      "actor": "shop_1a2b3c4d",
      "action": "landing.apply",
      "subject": "shop_1a2b3c4d",
      "meta": "3 files",
      "created_ms": 1760000000000
    }
  ]
}
```

**Errors**: 401 `UNAUTHORIZED`.

#### `GET /api/v1/admin/shops`

| | |
|---|---|
| Auth | admin token |

**Answer 200** — `{"shops": [ShopView]}` (every shop, newest first), same
shape as the owner view plus `owner_email` and `owner_name`.

**Errors**: 401 `UNAUTHORIZED`.

```bash
curl -s "$PLATFORM/api/v1/admin/shops" -H "authorization: Bearer $ADMIN_TOKEN"
```

#### `GET /api/v1/admin/activity`

| | |
|---|---|
| Auth | admin token |

**Answer 200** — `{"activity": [AuditRow]}` (every audit row, newest first,
max 200).

**Errors**: 401 `UNAUTHORIZED`.

### 1.8 Admin: users and account status

The status machine:

```
pending --approve--> approved --suspend--> suspended --reactivate--> approved
pending --reject--> rejected            (terminal)
```

#### `GET /api/v1/admin/users?status=pending|approved|suspended|rejected|all`

| | |
|---|---|
| Auth | admin token |
| Query | `status` optional; `all` (or empty) means every user |

**Answer 200** — `{"users": [UserView]}` (max 200, newest first).

```json
{
  "users": [
    {
      "id": "usr_1a2b3c4d5e6f7081",
      "email": "amina@example.com",
      "contact": "+256772000111",
      "shop_name": "Amina Studio",
      "status": "pending",
      "deploy_allowance": 0,
      "deploy_used": 0,
      "created_ms": 1760000000000,
      "approved_by": null
    }
  ]
}
```

`auth_hash` never crosses the API.

**Errors**: 401 `UNAUTHORIZED`.

```bash
curl -s "$PLATFORM/api/v1/admin/users?status=pending" \
  -H "authorization: Bearer $ADMIN_TOKEN"
```

#### `POST /api/v1/admin/approve`

| | |
|---|---|
| Auth | admin token |
| Body | `{"user_id": string, "deploy_allowance": i64}` (0…500) |

Sets the status to `approved`, stores the allowance and **mints the
one-shot signin token**. The token is returned exactly once — only its
SHA-256 hash is stored.

**Answer 200**

```json
{
  "token": "plat_1a2b3c4d5e6f7081",
  "user": {
    "id": "usr_1a2b3c4d5e6f7081",
    "email": "amina@example.com",
    "contact": "+256772000111",
    "shop_name": "Amina Studio",
    "status": "approved",
    "deploy_allowance": 3,
    "deploy_used": 0,
    "created_ms": 1760000000000,
    "approved_by": "admin"
  }
}
```

**Errors**

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHORIZED` | not the admin |
| 400 | `BAD_JSON` | body is not JSON |
| 400 | `BAD_ALLOWANCE` | `deploy_allowance` outside 0…500 |
| 404 | `NOT_FOUND` | no such user |
| 409 | `CONFLICT` | approve only from `pending` |

```bash
curl -s -X POST "$PLATFORM/api/v1/admin/approve" \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  --data '{"user_id":"usr_1a2b3c4d5e6f7081","deploy_allowance":3}'
```

#### `POST /api/v1/admin/reject`

| | |
|---|---|
| Auth | admin token |
| Body | `{"user_id": string, "reason": string?}` |

Terminal. The reason is stored as the user's note.

**Answer 204** — empty body.

**Errors**: 401 `UNAUTHORIZED`, 400 `BAD_JSON`, 404 `NOT_FOUND`,
409 `CONFLICT` (reject only from `pending`).

```bash
curl -s -i -X POST "$PLATFORM/api/v1/admin/reject" \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  --data '{"user_id":"usr_1a2b3c4d5e6f7081","reason":"duplicate account"}'
```

#### `POST /api/v1/admin/allowance`

| | |
|---|---|
| Auth | admin token |
| Body | `{"user_id": string, "deploy_allowance": i64}` (0…500) |

**Answer 200** — the updated `UserView` (not wrapped in an object).

```json
{
  "id": "usr_1a2b3c4d5e6f7081",
  "email": "amina@example.com",
  "contact": "+256772000111",
  "shop_name": "Amina Studio",
  "status": "approved",
  "deploy_allowance": 10,
  "deploy_used": 1,
  "created_ms": 1760000000000,
  "approved_by": "admin"
}
```

**Errors**: 401 `UNAUTHORIZED`, 400 `BAD_JSON`, 400 `BAD_ALLOWANCE`,
404 `NOT_FOUND`, 409 `CONFLICT` (`rejected` is terminal).

```bash
curl -s -X POST "$PLATFORM/api/v1/admin/allowance" \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  --data '{"user_id":"usr_1a2b3c4d5e6f7081","deploy_allowance":10}'
```

#### `POST /api/v1/admin/suspend` / `POST /api/v1/admin/reactivate`

| | |
|---|---|
| Auth | admin token |
| Body | `{"user_id": string}` |

**Answer 200** — the updated `UserView`.

**Errors**: 401 `UNAUTHORIZED`, 400 `BAD_JSON`, 404 `NOT_FOUND`,
409 `CONFLICT` (illegal transition: suspend only from `approved`,
reactivate only from `suspended`).

```bash
curl -s -X POST "$PLATFORM/api/v1/admin/suspend" \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  --data '{"user_id":"usr_1a2b3c4d5e6f7081"}'
```

```bash
curl -s -X POST "$PLATFORM/api/v1/admin/reactivate" \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  --data '{"user_id":"usr_1a2b3c4d5e6f7081"}'
```

### 1.9 Admin: shop tokens

#### `GET /api/v1/admin/tokens?status=active|used|cancelled|all`

| | |
|---|---|
| Auth | admin token |
| Query | `status` optional; `all` (or empty) means every token |

**Answer 200** — `{"tokens": [ShopToken]}` (newest first).

```json
{
  "tokens": [
    {
      "code": "0421",
      "shop_id": null,
      "status": "active",
      "created_ms": 1760000000000,
      "redeemed_ms": null,
      "redeemed_by": null,
      "cancelled_ms": null,
      "note": "batch jan"
    }
  ]
}
```

**Errors**: 401 `UNAUTHORIZED`.

#### `POST /api/v1/admin/tokens/mint`

| | |
|---|---|
| Auth | admin token |
| Body | `{"count": i64, "note": string?, "credits": i64?}` — `count` is 1…100, `credits` is the face value of each code (1 by default, 1…100000) |

Mints unique 4-digit codes (`"0000"`…`"9999"`), retrying on a primary-key
collision. **Each code is worth `credits` try-on credits** when it is
redeemed — a code minted with `credits: 25` gives the shop 25 credits.

**Answer 200** — `{"tokens": [ShopToken]}` in mint order.

```json
{
  "tokens": [
    {
      "code": "0421",
      "shop_id": null,
      "status": "active",
      "created_ms": 1760000000000,
      "redeemed_ms": null,
      "redeemed_by": null,
      "cancelled_ms": null,
      "note": "batch jan"
    }
  ]
}
```

**Errors**: 401 `UNAUTHORIZED`, 400 `BAD_JSON`, 400 `BAD_COUNT`
(`count` outside 1…100).

```bash
curl -s -X POST "$PLATFORM/api/v1/admin/tokens/mint" \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  --data '{"count":5,"note":"batch jan"}'
```

#### `POST /api/v1/admin/tokens/cancel`

| | |
|---|---|
| Auth | admin token |
| Body | `{"code": string}` |

Only an `active` (unused) code can be cancelled; the row stays for the
audit trail.

**Answer 200** — `{"token": ShopToken}` with `status: "cancelled"` and
`cancelled_ms` stamped.

**Errors**: 401 `UNAUTHORIZED`, 400 `BAD_JSON`, 500 (rust error) for an
unknown or already-used code.

```bash
curl -s -X POST "$PLATFORM/api/v1/admin/tokens/cancel" \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  --data '{"code":"0421"}'
```

### 1.10 The metered Genlook proxy

#### `GET|POST /api/v1/shop/genlook/<path>`

| | |
|---|---|
| Auth | **shop token** (`PLATFORM_TOKEN`) |
| Path | `<path>` is the remainder of the Genlook API path, passed through verbatim (`images/upload`, `try-on/sync`, `generations/<id>`, …) |
| Base | `https://api.genlook.app/tryon/v1` (override with the `GENLOOK_BASE` env var) |

The shop never sees the Genlook key: the platform sets `x-api-key` from its
own `GENLOOK_API_KEY` secret and forwards the body untouched (the
`content-type` is passed through as well).

**Metering**

1. one `tryon_tokens` credit is consumed **before** the upstream call
   (atomic check-and-decrement; it fails closed when the balance is
   unknown);
2. if the balance is empty the call is refused **before** any Genlook
   spend: `402 NO_CREDITS`;
3. **refund rule**: a Genlook **5xx** or a transport error refunds the
   credit (the shop was not served). A Genlook **4xx keeps the charge** —
   metered capacity was used and the payload was the shop's fault.

**Answer** — Genlook's own response, verbatim (status, headers of interest
and the JSON body).

**Errors**

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHORIZED` | no bearer, or no shop has that `PLATFORM_TOKEN` |
| 402 | `NO_CREDITS` | the shop's `tryon_tokens` balance is empty |
| 500 | (rust error) | the platform's `GENLOOK_API_KEY` secret is missing |

```bash
curl -s -X POST "$PLATFORM/api/v1/shop/genlook/try-on/sync" \
  -H "authorization: Bearer $PLATFORM_TOKEN" -H 'content-type: application/json' \
  --data '{"products":[{"externalId":"p1","title":"Coat","description":"","images":[{"source":{"url":"https://my-shop.latiforge.com/media/products/p1-garment.jpg"}}]}],"person":{"image":{"source":{"id":"img_abc"}}}}'
```

### 1.11 Health and fall-through

#### `GET /api/v1/health`

Public. **Answer 200** — `{"ok": true}`.

```bash
curl -s "$PLATFORM/api/v1/health"
```

Any other `/api/v1/...` path answers `404 NOT_FOUND`
(`{"code":"NOT_FOUND","message":"unknown /api/v1 command","status":404}`).
Any path outside `/api/v1/` is a static asset; when the `ASSETS` binding is
missing it answers `404 NO_FRONTEND`.

---

## 2. The deployed shop

Base: `$SHOP` = `https://{sub}.latiforge.com` (or the customer's own
domain). The shop is a separate Worker with its own D1 (`DB`), its own
R2 namespace (`shops/<id8>/…` inside the shared `tenant-images` bucket) and
its own assets.

### 2.1 Public catalogue

#### `GET /api/feed`

| | |
|---|---|
| Auth | public |
| CORS | `access-control-allow-origin: *` |
| Cache | `public, max-age=60, s-maxage=300` |

The feed the customer's landing page embeds.

**Answer 200**

```json
{
  "shop": {
    "name": "My Shop",
    "logo": "https://my-shop.latiforge.com/media/products/shop-logo.png",
    "url": "https://my-shop.latiforge.com",
    "studio": "https://my-shop.latiforge.com/studio"
  },
  "items": [
    {
      "id": "p1a2b3c",
      "title": "Wax coat",
      "price_cents": 450000,
      "currency": "UGX",
      "image": "https://my-shop.latiforge.com/media/products/p1a2b3c-garment.jpg",
      "url": "https://my-shop.latiforge.com/product/p1a2b3c",
      "category": "Jackets",
      "sizes": ["M", "L"]
    }
  ]
}
```

`shop.url` is the origin the request arrived on (so the links work on the
customer's own domain too) and every `items[].url` is
`{origin}/product/{id}` — the shop's product page.

#### `OPTIONS /api/feed`

The CORS preflight. **Answer 200** — `{}` with
`access-control-allow-origin: *`,
`access-control-allow-methods: GET, OPTIONS`,
`access-control-allow-headers: content-type`,
`access-control-max-age: 86400`.

#### `GET /api/products`

| | |
|---|---|
| Auth | public |
| Query | `q`, `category`, `size`, `max_price` (cents, integer) |

`q` matches the product title/description case-insensitively; `category` is
an exact match; `size` matches any of the product's sizes; `max_price`
keeps the products at or below the price.

**Answer 200** — an array of `Product`.

```json
[
  {
    "id": "p1a2b3c",
    "title": "Wax coat",
    "description": "Hand-waxed cotton",
    "price_cents": 450000,
    "currency": "UGX",
    "image_url": "https://my-shop.latiforge.com/media/products/p1a2b3c-garment.jpg",
    "model_image_url": "https://my-shop.latiforge.com/media/products/p1a2b3c-model.jpg",
    "styled_image_url": "",
    "r2_key": "shops/1a2b3c4d/products/p1a2b3c-garment.jpg",
    "category": "Jackets",
    "sizes": ["M", "L"],
    "created_at": "1760000000000"
  }
]
```

#### `GET /api/products/:id`

**Answer 200** — one `Product` (the shape above).
**Errors**: 404 `NOT_FOUND` ("product not found").

```bash
curl -s "$SHOP/api/products/p1a2b3c"
```

#### `GET /api/categories`

**Answer 200** — an array of `Category` (empty when the shop has no D1
binding or no rows).

```json
[{ "id": "c1a2b3c", "title": "Jackets", "image_url": "https://my-shop.latiforge.com/media/products/c1a2b3c-icon.png" }]
```

#### `GET /api/shop-settings`

**Answer 200** — `ShopSettings` (env defaults overridden by the owner's D1
row).

```json
{
  "shop_name": "My Shop",
  "owner_whatsapp": "256772000111",
  "currency": "UGX",
  "logo_url": "https://my-shop.latiforge.com/media/products/shop-logo.png"
}
```

### 2.2 Media

#### `GET /media/<key>`

| | |
|---|---|
| Auth | public |
| Path | the R2 object key, e.g. `products/p1a2b3c-garment.jpg` |

Serves the object from the shop's R2 namespace (a private bucket needs no
public `r2.dev` URL). The content type is derived from the extension;
`cache-control: public, max-age=3600, s-maxage=86400`.

**Errors**: 400 `INVALID_REQUEST` (bad media path), 404 `NOT_FOUND`.

```bash
curl -s -o coat.jpg "$SHOP/media/products/p1a2b3c-garment.jpg"
```

### 2.3 Shopper try-on

#### `POST /api/person-upload`

| | |
|---|---|
| Auth | public |
| Type | multipart/form-data, one file part named `file` |

Prechecks: `content-type` must be `multipart/form-data`, body ≤ 10 MB,
and the file part must be JPEG, PNG, WebP or HEIC. The multipart body is
forwarded untouched, so extra Genlook fields (`keepForDays`,
`externalUserId`) survive.

**Answer** — Genlook's answer: `{"imageId": "img_abc", "imageUrl": "…"}`.

**Errors**: 400 `INVALID_UPLOAD` (wrong type / unsupported mime),
400 `UPLOAD_TOO_LARGE` (over 10 MB).

```bash
curl -s -X POST "$SHOP/api/person-upload" -F "file=@person.jpg"
```

#### `POST /api/try-on` and `POST /api/try-on/sync`

Both routes do the same work (`/api/try-on/sync` is the one the UI calls).

| | |
|---|---|
| Auth | public (the `device_id` in the body carries the quota) |
| Body | `{"product_id": string, "title": string, "description": string, "image_url": string, "person_image_id": string, "device_id": string?}` |

Order of checks: payload validation → device quota gate → Genlook call.
The allowance is only consumed when Genlook accepted the generation
(200 or 202).

**Answer 200** (finished)

```json
{ "generationId": "gen_abc", "resultImageUrl": "https://…/signed.jpg" }
```

**Answer 202** (still running — poll `GET /api/generations/:id`)

```json
{ "generationId": "gen_abc", "status": "PROCESSING" }
```

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_REQUEST` | `product_id`, `person_image_id` or `image_url` missing |
| 400 | `DEVICE_REQUIRED` | `device_id` missing or not a valid device id (8–64 chars of `[A-Za-z0-9_-]`) |
| 402 | `QUOTA_EXCEEDED` | the device's free tries are used up — the body also carries the device snapshot (`device_id`, `free_tries`, `used`, `bonus`, `bonus_until_ms`, `remaining`, `owner_whatsapp`, `blocked`) |
| 403 | `BLOCKED` | the owner blocked the device — same body plus `blocked: 1` |

```bash
curl -s -X POST "$SHOP/api/try-on/sync" -H 'content-type: application/json' \
  --data '{"product_id":"p1a2b3c","title":"Wax coat","description":"","image_url":"https://my-shop.latiforge.com/media/products/p1a2b3c-garment.jpg","person_image_id":"img_abc","device_id":"d1a2b3c4"}'
```

#### `GET /api/generations/:id`

Polls a pending try-on. **Answer 200** — Genlook's generation body
(`{"status":"COMPLETED","resultImageUrl":"…"}` / `{"status":"FAILED"}`).
When the shop runs on the platform the call goes through the metered proxy
(§1.10), so it costs one credit and a 5xx is refunded.

```bash
curl -s "$SHOP/api/generations/gen_abc"
```

### 2.4 Device, quota and photo backup

#### `POST /api/device`

| | |
|---|---|
| Auth | public |
| Body | `{"id": string?, "fingerprint": string?}` |

Registers the browser or restores the id that was registered for the same
fingerprint (a new browser on the same machine). Without a usable `id` the
shop mints one (`d` + hex).

**Answer 200** — `DeviceSnapshot`.

```json
{
  "device_id": "d1a2b3c4",
  "name": "",
  "whatsapp": "",
  "free_tries": 3,
  "used": 0,
  "bonus": 0,
  "bonus_until_ms": 0,
  "remaining": 3,
  "owner_whatsapp": "256772000111",
  "blocked": 0
}
```

#### `POST /api/device/contact`

| | |
|---|---|
| Auth | public |
| Body | `{"device_id": string, "name": string?, "whatsapp": string?}` |

Stores the shopper's name and WhatsApp number (digits only, ≥ 9 digits) —
the identity the owner can actually reach.

**Answer 200** — `DeviceSnapshot`.
**Errors**: 400 `INVALID_REQUEST` (`device_id` missing/invalid),
400 `INVALID_WHATSAPP` (fewer than 9 digits).

#### `POST /api/device/redeem`

| | |
|---|---|
| Auth | public |
| Body | `{"device_id": string, "code": string}` |

Spends a 4-character unlock code (alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
— no `0/O/1/I/L`). `count` codes add try-ons; `time` codes open (or extend)
an unlimited window. A code never pays twice; the same device asking again
is a no-op that answers the snapshot.

**Answer 200** — `DeviceSnapshot`.
**Errors**: 400 `INVALID_REQUEST` (`device_id` missing), 404
`TOKEN_NOT_FOUND`, 409 `TOKEN_USED` (already used by another device, or
cancelled by the owner).

```bash
curl -s -X POST "$SHOP/api/device/redeem" -H 'content-type: application/json' \
  --data '{"device_id":"d1a2b3c4","code":"AB2C"}'
```

#### `POST /api/device/photos`

| | |
|---|---|
| Auth | public |
| Type | raw image body |
| Headers | `content-type: image/*`, `x-device-id: <device id>` |

Backs up the shopper's picked photo under
`people/<device_id>/<created_ms>-<rand>.<ext>`. The oldest photos of that
device are pruned past 60 (`MAX_PER_DEVICE`).

**Answer 200**

```json
{ "ok": true, "key": "shops/1a2b3c4d/people/d1a2b3c4/1760000000000-7.jpg", "bytes": 51234, "pruned": 0 }
```

**Errors**: 400 `INVALID_REQUEST` (`x-device-id` missing/invalid),
400 `INVALID_UPLOAD` (unsupported mime or size), 500 `NOT_CONFIGURED`
(no D1).

### 2.5 Owner routes (the studio)

All of these need `Authorization: Bearer <OWNER_TOKEN>`. **When the
deployment has no `OWNER_TOKEN` (the local rig), every owner route is
open** — `owner::authorized` treats an empty expected token as "allowed".

#### `POST /api/owner/login`

Body `{"token": string}` → **200** `{"ok": true}`; **401** `UNAUTHORIZED`
("bad token").

#### `POST /api/owner/logout`

**200** `{"ok": true}` (stateless — the browser drops the token).

#### `POST /api/studio/products`

Multipart. Text fields: `title` (required), `description`, `price_cents`,
`currency`, `category`, `sizes` (CSV), `id` (empty = new product).
File parts: `image0` = garment (required), `image1` = model, `image2` =
styled. R2 keys: `products/<id>-<slot>.<ext>`.

**Answer 200** — the full `Product`.
**Errors**: 401 `UNAUTHORIZED`, 400 `GARMENT_REQUIRED` (no garment photo),
500 `NOT_CONFIGURED` (`R2_PUBLIC_BASE` missing).

```bash
curl -s -X POST "$SHOP/api/studio/products" -H "authorization: Bearer $OWNER_TOKEN" \
  -F "title=Wax coat" -F "price_cents=450000" -F "currency=UGX" \
  -F "category=Jackets" -F "sizes=M,L" -F "image0=@coat.jpg"
```

#### `POST /api/studio/categories`

Multipart. Text field `title` (required), optional `id` (update path), file
part `image` (the icon). R2 key: `products/<id>-icon.<ext>`.

**Answer 200** — the full `Category`.
**Errors**: 401 `UNAUTHORIZED`, 400 `TITLE_REQUIRED`.

#### `POST /api/studio/shop`

Multipart. Text fields `shop_name`, `owner_whatsapp` (digits only),
`currency`; file part `logo` (R2 key `products/shop-logo.<ext>`).

**Answer 200** — `ShopSettings`.

#### `GET /api/studio/usage`

**Answer 200** — the dashboard read model.

```json
{
  "free_tries": 3,
  "devices_total": 2,
  "tryons_total": 5,
  "tokens_total": 3,
  "tokens_redeemed": 1,
  "devices": [
    {
      "id": "d1a2b3c4",
      "name": "Amina",
      "whatsapp": "256772000111",
      "fingerprint": "9f2b1c4d5e6f7081",
      "used": 4,
      "bonus": 0,
      "bonus_until_ms": 0,
      "blocked": 0,
      "photo_count": 2,
      "photo_bytes": 51234,
      "first_seen_ms": 1760000000000,
      "last_seen_ms": 1760000100000
    }
  ],
  "tokens": [
    {
      "code": "AB2C",
      "kind": "count",
      "value": 3,
      "note": "whatsapp order",
      "created_ms": 1760000000000,
      "redeemed_by": "d1a2b3c4",
      "redeemed_ms": 1760000050000,
      "canceled": 0
    }
  ],
  "owner_whatsapp": "256772000111",
  "photos_total": 2,
  "photos_bytes": 51234
}
```

#### `GET /api/studio/credits`

The owner's remaining Genlook credits (one try-on costs one).
**Answer 200** — `{"creditBalance": 42}`.

#### `POST /api/studio/tokens`

Mint unlock codes. Body `{"kind": "count"|"time", "value": i64, "count": i64?, "note": string?}`.
`value` is 1…10000 (try-ons, or hours for a `time` code); `count` is
clamped to 1…50.

**Answer 200**

```json
{ "kind": "count", "value": 3, "codes": ["AB2C", "K7MP"] }
```

**Errors**: 401 `UNAUTHORIZED`, 400 `INVALID_REQUEST` (`value` out of range).

#### `POST /api/studio/tokens/delete`

Body `{"code": string}` — removes the code (used or not).
**Answer 200** `{"ok": true}`. **Errors**: 401, 400 `INVALID_TOKEN`.

#### `POST /api/studio/tokens/cancel`

Body `{"code": string}` — marks an **unused** code as cancelled so it can
no longer be redeemed; the row stays for the audit trail.
**Answer 200** `{"ok": true}`. **Errors**: 401, 400 `INVALID_TOKEN`,
404 `TOKEN_NOT_FOUND`, 409 `TOKEN_USED`.

#### `POST /api/studio/tokens/purge`

Body `{"filter": "used"|"canceled"|"both"}` — bulk delete.
**Answer 200** `{"ok": true}`. **Errors**: 401, 400 `INVALID_REQUEST`.

#### `POST /api/studio/settings`

Body `{"free_tries": i64}` — the free try-ons every new device starts with
(clamped to 0…1000, default 3).
**Answer 200** `{"free_tries": 5}`.

#### `POST /api/studio/devices/block`

Body `{"device_id": string, "blocked": bool}` — block or unblock a device.
**Answer 200** — `DeviceSnapshot`.

#### `GET /api/studio/photos?device_id=<id>`

One device's folder (omit `device_id` for every device), newest first.
**Answer 200**

```json
{
  "device_id": "d1a2b3c4",
  "count": 1,
  "bytes": 51234,
  "photos": [
    { "key": "shops/1a2b3c4d/people/d1a2b3c4/1760000000000-7.jpg", "bytes": 51234, "mime": "image/jpeg", "created_ms": 1760000000000 }
  ]
}
```

#### `GET /api/studio/photo?key=<key>`

Streams one backed-up photo (owner only; these are not public).
**Answer 200** — the image bytes. **Errors**: 401, 400 `INVALID_REQUEST`
(`key` missing or outside the `people/` prefix), 404 `NOT_FOUND`.

#### `POST /api/studio/photos/delete`

Body `{"device_id": string?, "filter": "all"|"old", "days": i64?}` —
folder-style cleanup; `old` deletes what is older than `days` (default 30).

**Answer 200**

```json
{ "ok": true, "deleted": 12, "freed": 640120 }
```

**Errors**: 401, 400 `INVALID_REQUEST` (bad `device_id` or `filter`).

#### `POST /api/studio/tokens/redeem`

Body `{"code": string}` — the shop forwards a 4-digit **SaaSTryon platform**
code to `POST /api/v1/shop/tokens/redeem` with its `PLATFORM_TOKEN`.

**Answer 200** — `{"ok": true, "message": "Code redeemed - your try-on balance was topped up."}`
**Errors**: 401 `UNAUTHORIZED`, 400 `BAD_CODE` (not exactly four digits),
400 `REDEEM_FAILED` (the platform refused), 401 `REDEEM_FAILED` (the
platform refused the shop's token), 501 `PLATFORM_NOT_CONFIGURED` (the
shop has no `PLATFORM_URL`/`PLATFORM_TOKEN`, i.e. it is not a platform
tenant).

#### `POST /api/studio/tokens/request`

Body `{"requested": i64, "reason": string?}` — asks the platform admin for
more try-on credits (1…10000).

**Answer 200** — `{"ok": true, "message": "Request sent - the platform admin will review it and top up your balance."}`
**Errors**: 401, 400 `BAD_AMOUNT`, 400 `REQUEST_FAILED`, 401
`REQUEST_FAILED`, 501 `PLATFORM_NOT_CONFIGURED`.

### 2.6 Health and pages

| Route | Answer |
|---|---|
| `GET /healthz` | 200 `{"ok":true}` (text/plain body `{"ok":true}`) |
| `GET /` | 302 → `/app/` |
| `GET /product/:id` | 302 → `/app/product.html?id=<id>` |
| `GET /studio` | 302 → `/app/studio.html?owner=1` |
| `GET /dashboard` | 302 → `/app/dashboard.html?owner=1` |
| `GET /app/…` | the shop's static app (the `ASSETS` binding) |

```bash
curl -s "$SHOP/healthz"
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "$SHOP/product/p1a2b3c"
```

---

## 3. The customer's landing page

Three steps: **upload the dist → publish → embed the feed**.

### 3.1 Upload the dist (one file per call)

The customer's `dist` is uploaded file by file; the `path` query parameter
is the file's place in the dist (the browser's file name is ignored — it
may be a full path).

```bash
# index.html -> the shop's root
curl -s -X POST "$PLATFORM/api/v1/shop/landing/file?path=%2Findex.html" \
  -H "authorization: Bearer $SESSION" -F "file=@dist/index.html"

# assets/app.css -> /assets/app.css
curl -s -X POST "$PLATFORM/api/v1/shop/landing/file?path=%2Fassets%2Fapp.css" \
  -H "authorization: Bearer $SESSION" -F "file=@dist/assets/app.css"
```

Rules: paths are `[A-Za-z0-9.\-_/]`, ≤ 200 characters, no `..`, no `//`;
`/` means `/index.html`; one file ≤ 5 MB. Each call answers
`{"ok":true,"path":"…","files":N}` and rewrites the manifest entry for that
path (re-uploading a path replaces it).

The bytes land in the R2 `BUNDLES` bucket:

```
landings/<shop_id>/manifest.json
landings/<shop_id>/files/index.html
landings/<shop_id>/files/assets/app.css
```

### 3.2 Publish

```bash
curl -s -X POST "$PLATFORM/api/v1/shop/landing/apply" \
  -H "authorization: Bearer $SESSION" -H 'content-type: application/json' --data '{}'
```

The platform:

1. reads the landing files from R2 (400 `NO_FILES` when there are none);
2. loads the shop's bundle assets from R2 (`bundles/<id>/assets/…`);
3. merges them into **one** asset set — the bundle's app files keep their
   `/app/…` paths, the landing files take the root (`/index.html`, …);
4. opens an asset upload session, uploads only the hashes Cloudflare does
   not have (`uploaded: 0` on a re-publish), and re-PUTs the shop script
   with the completion jwt — the bindings (including the shop's
   `PLATFORM_TOKEN`) are re-sent unchanged;
5. answers `{"ok":true,"files":N,"uploaded":M,"url":"https://…"}`.

Afterwards the shop's root serves the customer's page and `/app/…` still
serves the shop app.

### 3.3 Embed the feed

The feed is the piece a landing page embeds: it is CORS-open
(`access-control-allow-origin: *`) and cacheable
(`public, max-age=60, s-maxage=300`), so a static page can read it from
anywhere — including from the customer's own domain.

```html
<div id="grid"></div>
<script>
fetch("https://my-shop.latiforge.com/api/feed")
  .then(r => r.json())
  .then(f => {
    document.querySelector("#grid").innerHTML = f.items.map(i =>
      `<a class="card" href="${i.url}">
         <img src="${i.image}" alt="${i.title}">
         <span>${i.title}</span>
         <span>${(i.price_cents / 100).toFixed(2)} ${i.currency}</span>
       </a>`
    ).join("");
  });
</script>
```

Every card links to `f.items[].url` = `{shop origin}/product/{id}`, which
redirects (302) to `/app/product.html?id={id}` — the shop's product page
with the try-on flow. `f.shop.logo`, `f.shop.name` and `f.shop.studio` are
the other three values the landing page usually wants.

If the page lives on the customer's own domain, `f.shop.url` and the item
URLs carry the origin the feed was requested from, so the links stay
correct.

---

## 4. Error codes

### 4.1 The platform

| Code | Status | Message (as coded) | What the client should do |
|---|---|---|---|
| `BAD_JSON` | 400 | `expected {…}` | the body is not the documented shape — fix the request |
| `BAD_EMAIL` | 400 | email does not look deliverable | re-enter the email |
| `BAD_CONTACT` | 400 | contact needs 7-20 digits | re-enter the phone number |
| `BAD_SHOP_NAME` | 400 | shop_name too long (max 80) | shorten the name |
| `BAD_TOKEN` | 400 | token required | send a non-empty `token` |
| `BAD_ALLOWANCE` | 400 | deploy_allowance 0..=500 | clamp the allowance |
| `BAD_COUNT` | 400 | count must be 1..=100 | reduce the batch size |
| `BAD_SUBDOMAIN` | 400 | subdomain required / invalid or reserved | pick another label (3–63 chars, `[a-z0-9-]`, not reserved) |
| `BAD_DOMAIN` | 400 | that is not a domain name | send a bare hostname |
| `BAD_PATH` | 400 | that file path is not allowed | fix the landing file path |
| `NO_FILE` | 400 | expected a file part named 'file' | send the multipart part `file` |
| `TOO_BIG` | 400 | one landing file may be 5 MB | split the file |
| `BAD_AMOUNT` | 400 | request between 1 and 10000 tokens | clamp the amount |
| `OWNER_MISSING` | 400 | unknown owner | the session points at a deleted user — sign in again |
| `UNAUTHORIZED` | 401 | missing or invalid token | send the right Bearer; re-login when it is a session |
| `NO_CREDITS` | 402 | try-on balance empty — redeem a platform code in settings | top up (redeem a 4-digit code or request credits) |
| `NO_ALLOWANCE` | 402 | no deploy allowance left | the admin must raise `deploy_allowance` |
| `NOT_ACTIVE` | 403 | account pending approval | wait for the admin |
| `NOT_APPROVED` | 403 | account not approved (…status…) | wait for the admin / the account is suspended or rejected |
| `SUSPENDED` | 403 | account suspended | the admin must reactivate |
| `REJECTED` | 403 | signup rejected | terminal |
| `EMAIL_TAKEN` | 409 | that email already signed up | use another email |
| `CONFLICT` | 409 | approve only from pending / reject only from pending / illegal status transition / rejected is terminal | read the current status first; do not retry blindly |
| `ALREADY_DECIDED` | 409 | this request was already decided | refresh the list |
| `OUR_DOMAIN` | 409 | that is our own zone - pick a domain you own | use the customer's own domain |
| `ZONE_NOT_OURS` | 409 | add this Cloudflare account as a collaborator on that domain's zone … | the customer must add the collaborator (or move the domain to Cloudflare) |
| `SUBDOMAIN_TAKEN` | 409 | subdomain already taken | pick another label |
| `NO_SHOP` | 404 | deploy a shop first | deploy a shop before this call |
| `NOT_FOUND` | 404 | unknown /api/v1 command, no such user, unknown credit request | check the path / id |
| `NO_FRONTEND` | 404 | platform frontend not deployed | the API works; the pages are not deployed |
| `NO_BUNDLE` | 500 | no released shop bundle configured | set the `BUNDLE_ID` secret |
| `BUNDLE_FAILED` | 500 | bundle: … | the bundle in R2 is broken — check `bundles/<id>` |
| `STORE_FAILED` | 500 | store: … | the platform D1 write failed — retry, then check the platform D1 |
| `NO_CF` | 500 | missing CLOUDFLARE_API_TOKEN secret / missing CF_ACCOUNT_ID var | fix the platform's Cloudflare config |
| `LANDING` | 500 | the landing files could not be read from R2 | check the `BUNDLES` R2 binding |
| `CF_FAILED` | 502 | cloudflare: … / the script PUT failed | a Cloudflare API call failed — retry |
| `ASSETS` | 502 | the asset staging failed | the asset upload session failed — retry |

### 4.2 The shop

| Code | Status | Message (as coded) | What the client should do |
|---|---|---|---|
| `INVALID_REQUEST` | 400 | (per route: `device_id required`, `image_url required`, `product_id required`, `person_image_id required`, `bad device_id`, `key required`, `filter must be all\|old`) | fix the request |
| `INVALID_UPLOAD` | 400 | unsupported type: use JPEG, PNG, WebP or HEIC | re-encode the image |
| `UPLOAD_TOO_LARGE` | 400 | upload over 10 MB | shrink the photo |
| `INVALID_WHATSAPP` | 400 | enter a full WhatsApp number | enter ≥ 9 digits |
| `INVALID_TOKEN` | 400 | that is not a 4-character code | fix the code |
| `GARMENT_REQUIRED` | 400 | garment photo (image0) required | attach the garment photo |
| `TITLE_REQUIRED` | 400 | title required | send a title |
| `BAD_CODE` | 400 | enter the 4-digit code | the platform code must be exactly four digits |
| `BAD_AMOUNT` | 400 | request between 1 and 10000 credits | clamp the amount |
| `DEVICE_REQUIRED` | 400 | device_id required for try-on | send the device id |
| `REDEEM_FAILED` | 400/401 | the platform's message | the code was refused |
| `REQUEST_FAILED` | 400/401 | the platform's message | the request was refused |
| `UNAUTHORIZED` | 401 | owner token required | send `Bearer <OWNER_TOKEN>` |
| `QUOTA_EXCEEDED` | 402 | free try-ons used up - ask the shop for an unlock code | show the banner; the shopper buys an unlock code |
| `BLOCKED` | 403 | this device was blocked by the shop - contact them on WhatsApp | no unlock path; contact the shop |
| `NOT_FOUND` | 404 | product not found / no such file / photo not found | check the id |
| `TOKEN_NOT_FOUND` | 404 | no such unlock code | check the code |
| `TOKEN_USED` | 409 | that code was already used / that code was canceled | the code is spent |
| `NOT_CONFIGURED` | 500 | R2_PUBLIC_BASE missing / photo backup needs D1 | the deployment is missing a binding |
| `PLATFORM_NOT_CONFIGURED` | 501 | this shop does not run on the platform yet | the shop is not a platform tenant |

---

## 5. curl cookbook

```bash
PLATFORM=https://latiforge.com
API=$PLATFORM/api/v1
ADMIN_TOKEN=…            # the platform's ADMIN_TOKEN secret
```

### 5.1 Sign up and sign in

```bash
# 1. sign up (the answer is always {"status":"pending"})
curl -s -X POST "$API/signup" -H 'content-type: application/json' \
  --data '{"email":"amina@example.com","contact":"+256772000111","shop_name":"Amina Studio"}'

# 2. the admin approves -> the one-shot plat_ token comes back ONCE
TOKEN=$(curl -s -X POST "$API/admin/approve" \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  --data '{"user_id":"usr_1a2b3c4d5e6f7081","deploy_allowance":3}' | jq -r .token)

# 3. exchange it for a session
SESSION=$(curl -s -X POST "$API/login" -H 'content-type: application/json' \
  --data "{\"token\":\"$TOKEN\"}" | jq -r .session_id)

# 4. check the session
curl -s "$API/me" -H "authorization: Bearer $SESSION"
```

### 5.2 Deploy a shop

```bash
curl -s -X POST "$API/deploy" \
  -H "authorization: Bearer $SESSION" -H 'content-type: application/json' \
  --data '{"subdomain":"my-shop","shop_name":"My Shop","tier":"starter"}'
# -> {"ok":true,"shop_id":"shop_1a2b3c4d","subdomain":"my-shop",
#     "url":"https://my-shop.latiforge.com","workers_dev_url":"…"}
```

### 5.3 Attach the customer's own domain

```bash
curl -s -X POST "$API/shop/domain" \
  -H "authorization: Bearer $SESSION" -H 'content-type: application/json' \
  --data '{"domain":"myshop.com"}'
# -> {"ok":true,"hostname":"myshop.com","url":"https://myshop.com","zone":"myshop.com"}
```

### 5.4 Upload a landing file and publish

```bash
curl -s -X POST "$API/shop/landing/file?path=%2Findex.html" \
  -H "authorization: Bearer $SESSION" -F "file=@dist/index.html"
# -> {"ok":true,"path":"/index.html","files":1}

curl -s -X POST "$API/shop/landing/apply" \
  -H "authorization: Bearer $SESSION" -H 'content-type: application/json' --data '{}'
# -> {"ok":true,"files":1,"uploaded":1,"url":"https://my-shop.latiforge.com"}
```

### 5.5 Read the feed (the landing page's data source)

```bash
curl -s "$SHOP/api/feed"
# -> {"shop":{"name":…,"logo":…,"url":…,"studio":…},"items":[{"id":…,"title":…,
#      "price_cents":…,"currency":…,"image":…,"url":"…/product/<id>",…}]}
```

### 5.6 Read the shop list

```bash
# the owner's shops
curl -s "$API/shops" -H "authorization: Bearer $SESSION"

# every shop (admin) — includes owner_email / owner_name
curl -s "$API/admin/shops" -H "authorization: Bearer $ADMIN_TOKEN"

# the activity feed
curl -s "$API/shops/activity" -H "authorization: Bearer $SESSION"
curl -s "$API/admin/activity" -H "authorization: Bearer $ADMIN_TOKEN"
```

### 5.7 Approve a credit request

```bash
# 1. the admin lists the pending requests
ID=$(curl -s "$API/admin/credits" -H "authorization: Bearer $ADMIN_TOKEN" | jq -r '.requests[0].id')

# 2. and approves one
curl -s -X POST "$API/admin/credits/approve" \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  --data "{\"id\":\"$ID\"}"
# -> {"ok":true,"granted":100,"shop_id":"shop_1a2b3c4d"}
```

### 5.8 Bonus: mint a 4-digit code and redeem it from a shop

```bash
# the admin mints codes
curl -s -X POST "$API/admin/tokens/mint" \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  --data '{"count":5,"note":"batch jan"}'

# the shop redeems one with its own PLATFORM_TOKEN
curl -s -X POST "$API/shop/tokens/redeem" \
  -H "authorization: Bearer $PLATFORM_TOKEN" -H 'content-type: application/json' \
  --data '{"code":"0421"}'
```

---

## 6. Findings: the code and the docs disagree

Read-only observations from the sources listed at the top. None of them is
fixed here.

| # | Where | Finding |
|---|---|---|
| F1 | `SaaSTryon/platform/src/outbound.rs:67` | `shops::consume_credit(&db, &shop.id, now)` is called but **no such function exists** in `SaaSTryon/platform/src/shops.rs` (only `grant_credits` and `credits_left`). The metered Genlook proxy (§1.10) cannot compile as it stands — the whole platform crate is blocked by it. |
| F2 | `SaaSTryon/platform/src/deployer/bundle/multipart.rs:227` | The test asserts `b.len() == 5` ("exact 5 bindings") but `provision::bindings_for` returns **6** (`R2_PUBLIC_BASE` and `ASSETS` were added). `provision.rs`'s own test asserts 6 — the two tests contradict each other. |
| F3 | `SaaSTryon/platform/src/deployer/provision.rs:49-77` vs `worker/src/routes/platform.rs:11-28` | The deployed shop's bindings carry **no `PLATFORM_URL` and no `GENLOOK_API_KEY`**. `platform::configured()` therefore returns false on every platform-deployed shop, so the shop worker takes the *direct* Genlook path and fails with "missing GENLOOK_API_KEY secret" (a 500). The metered proxy path (§1.10) is unreachable from a deployed shop as the bindings stand. |
| F4 | same as F3, plus `worker/src/routes/owner.rs:32-48` | The bindings carry **no `OWNER_TOKEN`** either. `owner::authorized` treats an empty expected token as "allowed", so **every `/api/studio/*` route of a platform-deployed shop is open** (no bearer needed). |
| F5 | `SaaSTryon/platform/src/http.rs` (header comment) vs the router | The header still documents the "FROZEN for Phase B" REST table and says shops/provisioning/deployer "are Phase C+". The router has grown 20+ routes since; the comment is stale. |
| F6 | `SaaSTryon/platform/src/dashboard.rs:54-59` | The fallback URL is `format!("{}.workers.dev", shop.subdomain)`, but a shop's workers.dev host is `shop-<id8>.<account-sub>.workers.dev` (see `deployer/domain.rs` and `hostnames.rs`). The fallback is not a real URL. |
| F7 | `SaaSTryon/platform/src/landing.rs:225,340` | The landing URLs are hard-coded to `https://{sub}.latiforge.com` while the dashboard (`dashboard.rs`) uses `CF_ZONE_NAME`. With a different zone the two disagree. |
| F8 | `SaaSTryon/platform/frontend/src/api.ts:192-200` | `LandingOut` is typed `{ok, files: string[], url}`, but `GET /api/v1/shop/landing` answers `{ok, shops: [{shop_id, subdomain, url, files}]}`. The UI type does not match the answer. |
| F9 | `SaaSTryon/platform/frontend/src/api.ts:7-17` | `PlatformUser` declares `name` and `role`, but the Rust `UserView` has neither (it has `shop_name`, `approved_by`, `created_ms`). |
| F10 | `SaaSTryon/platform/src/auth.rs:285` and `admin.rs:434` | An unknown / already-used / cancelled code turns into `worker::Error::RustError`, i.e. a **500 without the `{code,message,status}` envelope**, while the platform's own contract says "errors are never 200: JSON `{code,message,status}`". A 4xx (`404 TOKEN_NOT_FOUND`, `409 TOKEN_USED`) would be the consistent answer. |
| F11 | `SaaSTryon/platform/src/domain.rs:56` | The zone lookup is `/zones?name=<domain>` with the **full hostname**. A customer attaching `shop.myshop.com` (a subdomain of their zone) is refused with `ZONE_NOT_OURS`, because the zone is named `myshop.com`. Only the apex of a zone can be attached. |
| F12 | `SaaSTryon/platform/src/deploy.rs:49-61` vs `auth.rs:183-192` | The same condition ("the account is not approved") is `NOT_APPROVED` on `/deploy` (403) but `NOT_ACTIVE` on `/me` and `/login` (403). A client cannot branch on one code. |
| F13 | `SaaSTryon/platform/src/shops.rs:378-394` | `activity(db, Some(&shop_id), …)` filters the audit table on `subject = shop_id`. Rows whose subject is the *user* id (signup) or the *token code* are therefore invisible in the owner's activity feed. |
| F14 | `SaaSTryon/docs/PLATFORM.md:608-610` | §7.5 still documents `POST /platform/v1/shops/me/credit-request` and `…/domains`; the implemented paths are `POST /api/v1/shop/credits/request` and `POST /api/v1/shop/domain`. |
| F15 | `SaaSTryon/platform/src/deployer/mod.rs:16-18` | The module header still says the Phase D domain attach "is NOT wired here — no HTTP routes either", but `deployer/domain.rs` **is** wired (`domain::attach_shop_domain` is called by `deploy_shop_with`). |
| F16 | `SaaSTryon/docs/Deploy.md:175-176` vs `SaaSTryon/platform/src/landing.rs:239-241` | The Deploy.md publish example posts **no body** to `/api/v1/shop/landing/apply`. `json_body::<ApplyIn>` returns `None` for an empty body, so that call answers `400 BAD_JSON`. The body must be `{}` (as this document shows). |
