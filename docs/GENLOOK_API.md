# Genlook Try-On API — reference & integration notes

Version 1 (v1) of the Genlook Virtual Try-On API, as used by the SaaSTryon
shop worker + platform proxy. Compiled from the official docs
(https://docs.genlook.app/docs/tryon-api/) and the vendor example
(`_vendor/virtual-try-on-api-example-main/`). This is the file to update
when the integration changes.

## 0. The one-line summary

Upload a customer photo once -> get an `imageId`; call `POST /try-on/sync`
(or `POST /try-on`) with a product + that `imageId`; poll
`GET /generations/:id` until `COMPLETED`; show `resultImageUrl` — a
temporary signed Google Cloud Storage URL.

## 1. Facts

| | |
| - | - |
| Base URL | `https://api.genlook.app/tryon/v1` |
| Auth | `x-api-key: gk_...` header on every request |
| Price | 1 credit per product in the try-on; +1 for 2K result. Refunded on failure. $0.04 PAYG, from $0.015 on plan. New accounts: 10 free credits. |
| Test free | `mock: true` in the try-on body |
| Speed | ~10 s per result; first try-on of a product takes a few s longer (analysis) |
| Image formats | JPEG, PNG, WebP, HEIC; **10 MB max** |
| Errors | `{ code, message, status }`; switch on `code`. Every error carries `x-request-id`. |
| SDK | `@genlook/api` (Node 20+/Deno/Bun/edge). Server-side only. |

### Pricing — what actually costs (IMPORTANT)

**Only generation costs.** Genlook charges **1 credit per product in the
try-on** (the endpoint `POST /try-on` or `POST /try-on/sync` — *sync* is
the same generation, just synchronous). Anything else is free:

| Call | Charged? |
| - | - |
| `POST /images/upload` (customer photo) | **No** — free. Returns an `imageId` to reuse. There is no upload fee. |
| `GET /generations/:id` (poll) | **No** — free. |
| `POST /try-on` / `POST /try-on/sync` | Yes — 1 credit per product (the generation). |
| `POST /products`, `GET /products`, credits, etc. | No. |

> If *our platform* briefly charged credits on uploads/polls, that was a
> bug in our metering, **not** a Genlook fee — see §6.

## 2. Flow

```
You -> POST /images/upload (multipart file)  -> imageId (reuse for every try-on)
You -> POST /try-on/sync (product + imageId) -> 200 COMPLETED + resultImageUrl
                                                   or 202 PENDING + generationId
You -> GET /generations/:id (poll ~1s)        -> COMPLETED + resultImageUrl
```

`/try-on/sync` stays open up to **90 s** (client timeout must be > that,
100 s recommended). If still running at 90 s it answers **202** with the
`generationId` — then poll.

### Products (three shapes)

| Shape | Body | Lifetime |
| - | - | - |
| Inline | `{ externalId, title, description, images }` | 30 days after last use |
| Reference | `{ externalId }` | same product, no payload |
| One-shot | `{ title, description, images }` (no externalId) | 7 days after last use |

- Send a product inline once, then reuse its `externalId` — later calls
  skip analysis and answer faster.
- Every use resets the lifetime; a reference that returns
  `PRODUCT_NOT_FOUND` means it expired — resend it inline.
- `POST /products` is optional (only for never-expiring products or
  `GET /products` visibility).

## 3. Endpoints we use

### 3.1 `POST /images/upload` — upload customer photo
- Body: multipart/form-data, field `file` (required). Optional: `crop`
  (bool, default true → 4:5 around person), `externalUserId` (GDPR),
  `keepForDays` (1/3/7; default = account setting, 7).
- Response `201`:
  ```json
  { "imageId": "ephemeral/customer/ttl-7d/acc_x/2026…jpeg",
    "imageUrl": "https://storage.googleapis.com/…" }
  ```
- `imageUrl` is short-lived preview; `imageId` is the opaque token passed
  back as `person.image.source.id`.

### 3.2 `POST /try-on/sync` — create try-on, wait for result
- Costs 1 credit, refunded if the generation fails.
- Body (identical to `/try-on`):
  ```json
  { "products": [ { "externalId": "shirt-42",
                     "title": "…", "description": "…",
                     "images": [ { "source": { "url": "https://cdn/…" } } ] } ],
    "person": { "image": { "source": { "id": "ephemeral/customer/…" } } } }
  ```
- `200` → `{ generationId, status: "COMPLETED", resultImageUrl,
  productExternalIds, createdAt, updatedAt }`. `resultImageUrl` is a
  temporary signed GCS URL.
- `202` → `{ generationId, status: "PROCESSING"|"PENDING", … }` → poll.
- `504` `GENERATION_TIMEOUT` → the generation did not finish within 60 s,
  cancelled, credit refunded. **The generation id comes in
  `details.generationId`.**

### 3.3 `POST /try-on/sync` — AI label

Results are AI-modified. By default Genlook stamps a **"AI MODIFIED"
badge** (EU AI Act art. 50) bottom-right on every result (the account
setting in dashboard → Settings → Watermark & AI label; per-call:
`output: { aiLabel: false }`). Turning it off is allowed only if *you*
disclose AI-modified content to your users. The metadata mark (XMP/IPTC
`DigitalSourceType = trainedAlgorithmicMedia`) cannot be turned off.

**Our choice: `output: { aiLabel: false }` is sent on every try-on**
(the storefront already labels generated results as AI try-ons in its UI).
Recorded here so the decision is tracked.

### 3.3 `GET /generations/:id` — poll status
- Response: `{ generationId, status, resultImageUrl?, errorCode?,
  errorMessage?, createdAt, updatedAt }`.
- `status` ∈ `PENDING | PROCESSING | COMPLETED | FAILED`.
- `COMPLETED` → `resultImageUrl` present; else fetch the generation again
  for a fresh URL (they expire).
- `FAILED` → `errorCode` stable, `errorMessage` human-readable. Refunded.

## 4. Error codes

Same shape `{ code, message, status }` (+ `details` for VALIDATION_FAILED).

| Code | HTTP | Meaning | Retry |
| - | - | - | - |
| `MISSING_API_KEY` / `INVALID_API_KEY` | 401 | missing/wrong key | No |
| `FORBIDDEN` | 403 | other account's resource | No |
| `VALIDATION_FAILED` | 400 | invalid body, see `details` | No |
| `EXTERNAL_ID_REQUIRED` / `PRODUCT_IMAGES_REQUIRED` | 400 | products shape | No |
| `CUSTOMER_IMAGE_REQUIRED` / `FILE_REQUIRED` | 400 | missing person/file | No |
| `INVALID_IMAGE_INPUT` / `INVALID_IMAGE` | 400 | bad image | No |
| `UNSUPPORTED_IMAGE_TYPE` | 400 | not JPEG/PNG/WebP/HEIC | No |
| `CUSTOMER_IMAGE_FETCH_FAILED` | 400 | person URL undownloadable | once, then fix URL |
| `PRODUCT_IMAGE_FETCH_FAILED` | async | product image URL undownloadable | once, then fix URL |
| `MISSING_REQUIRED_CLASSIFICATION` | 422/async | product needs e.g. worn-on-model image | add image |
| `CONTENT_POLICY_VIOLATION` | 422/async | adult/swimwear etc. Refunded | after top-up / contact |
| `MULTI_PRODUCT_NOT_SUPPORTED` | async | non-clothing in multi-product. Refunded | split try-on |
| `FILE_TOO_LARGE` | 413 | >10 MB | resize |
| `INSUFFICIENT_CREDITS` | 402 | balance 0 | top-up |
| `QUOTA_EXCEEDED` | 402 | account quota, usually temporary | yes, backoff |
| `RATE_LIMITED` | 429 | too many requests | yes, honor Retry-After |
| `PRODUCT_NOT_FOUND` | 404 | expired/never created | resend inline |
| `GENERATION_NOT_FOUND` | 404 | wrong id | No |
| `ACCOUNT_NOT_FOUND` | 404 | rare | No |
| `ROUTE_NOT_FOUND` | 404 | unknown path (body may not be the error shape) | No |
| `RESERVED_EXTERNAL_ID` | 409 | externalId starts `_anon_` | No |
| `INTERNAL_ERROR` | 500 | unexpected | yes, up to 3× |
| `GENERATION_FAILED` | async | generation failed (refunded) | yes, up to 3× |
| `GENERATION_TIMEOUT` | async(504) | didn't finish in time (refunded) | yes |

## 5. Our integration wiring (factual)

Shop worker (`worker/src/routes/`):
- `person.rs` — `POST /api/person-upload` — forwards multipart untouched to
  Genlook `images/upload` (via platform proxy when configured; else direct
  with our key). Returns the `imageId`.
- `tryon.rs` — `POST /api/try-on/sync` — validates, gates device quota,
  builds the sync body (always inline product with `image_url`), forwards
  to Genlook `try-on/sync`; on 200/202 records device quota. Poll route
  `GET /api/generations/:id` forwards to Genlook `generations/:id`.
- `genlook_api.rs` — base URL + key + `forward()` helper (JSON error body
  preserved).

Platform proxy (`SaaSTryon/platform/src/outbound.rs`):
- `POST/GET /api/v1/shop/genlook/<path>` — shop-authenticated (Bearer =
  cluster secret). **Only generation-creating paths** (`try-on`,
  `try-on/sync`) consume a credit (`is_metered_path`); uploads and polls
  are free. Refunds the metered credit on transport error or upstream
  `>= 500`; transport errors answer JSON `{code,message,status}`
  (`GENLOOK_UNREACHABLE`).

Frontend (`frontend/src/core/api.ts`, `components/studio.ts`):
- `tryOnSync()` returns `{status, body}`; `202` → `pollGeneration(id)`
  polls `GET /api/generations/:id` every 2 s up to 45× (~90 s), expecting
  `status === "COMPLETED" && resultImageUrl`.
- On a non-200/202 sync status that still carries a generation id (the
  `GENERATION_TIMEOUT` case, `details.generationId`), the UI now polls it
  instead of failing; only a truly id-less error shows
  `body.message || "try-on failed (credit refunded)"`.

## 6. Diagnosed failure: "try-on failed (credit refunded)" while the image exists

Observed: generation completed on Genlook's side (visible in
`platform.genlook.app/generations/…` and the result exists in the GCS
bucket), but the shop UI reported "try-on failed (credit refunded)".

Root cause chain:
1. The platform's `handle_genlook` refunds 1 credit on upstream `>=500`
   **or transport error**, but the failure response it returns to the shop
   is the raw upstream response — on a transport error that is a bare
   Worker error (non-JSON), and on a 5xx it may also lack a message body.
2. Frontend `studio.ts` only understands 200/202; anything else throws
   `body.message || "try-on failed (credit refunded)"` — with an empty/non-
   JSON body that is exactly the misleading default shown.
3. The generation itself kept running server-side and completed after the
   sync path had already given up / errored — hence the "image exists but
   shop said failed" state.

Secondary issues found along the way:
- **Metering was wrong (fixed)**: the platform proxy used to consume a
  credit on **every** Genlook call, including `images/upload` and each
  `generations/:id` poll — one try-on could burn 1 (upload) + 1 (sync) +
  N (polls) credits. Now only `try-on`/`try-on/sync` are metered;
  uploads and polls are free (matches Genlook's pricing).
- **No PRODUCT_NOT_FOUND inline retry**: the vendor example resends the
  product inline on `PRODUCT_NOT_FOUND`; we always send inline so this is
  latent, but if we ever switch to reference-only we must add it.
- **Sync timeout handling (fixed)**: on `GENERATION_TIMEOUT` (504) the
  generationId arrives in `details.generationId`; the client now polls it
  instead of failing — while the sync request is still open, Genlook can
  still complete it.
- **Result URL lifetime**: `resultImageUrl` is a temporary signed URL; the
  "fresh URL on re-fetch" behavior should be used when storing results for
  later reuse.

## 7. Storage economics (factual, reuse Genlook GCS)

- **Person photos** are already uploaded to Genlook (its GCS bucket) and
  we keep only their `imageId`; a same-browser "backup" copy is ALSO stored
  in our R2 (`people/<device>/…`). That double-stores the same bytes.
  Options: (a) keep R2 backup only for offline recovery, prune on Genlook
  expiry; (b) drop R2 backup and rely on Genlook `keepForDays`, re-upload
  if expired.
- **Results** are shown straight from Genlook's signed `resultImageUrl` —
  we already do NOT copy them into our R2. Good; just remember freshness.
- **Product images** are owner-uploaded and live in OUR R2
  (`products/…` / `shops/<id>/products/…`); Genlook fetches them by URL
  (`products[].images[].source.url`). No change needed. If we wanted to
  avoid storing them ourselves we'd still need a public URL for Genlook to
  fetch (its bucket is not write access for us), so keep R2 for products.

## 8. Fixes applied

1. Platform `outbound.rs`: meter only try-on-creating paths (charge one
   credit per `try-on/sync`/`try-on`; uploads and polls are free); transport
   errors answer JSON `{code,message,status}` so the shop surfaces a real
   message (instead of a bare 500 + misleading "credit refunded").
2. Frontend `studio.ts`: on a non-200/202 sync that still carries a
   generation id (`details.generationId`, the timeout case), poll it
   instead of failing; a truly id-less error shows the JSON message when
   present.
3. AI label: `output: { aiLabel: false }` is now in the try-on body — the
   storefront discloses the AI-generated character of results itself.
4. Optional (not yet done): resend the product inline on
   `PRODUCT_NOT_FOUND` if we ever move to reference-only products.

Update this file as those land.
