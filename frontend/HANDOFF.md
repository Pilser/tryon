# Frontend handoff (Astra build)

The Rust worker owns the **API only**. Everything visual lives here in
`frontend/` — TypeScript + StyleX, built with bun (`bun run build` -> `dist/`). Rebuild or
reskin freely; the contract below is stable.

## Run locally

```bash
# the shop worker + this folder, together
./dev-all.sh
# landing : http://localhost:8811/app/
```

## Pages

| File | Purpose |
|---|---|
| `index.html` | Shop landing shell (mounts only; `src/main.ts` boots by `data-page`) |
| `product.html?id=<id>` | Detail: gallery swap, inquire/share, try-on studio, timeline |
| `studio.html?id=<id>[&owner=1]` | Unified studio: visitor try-on + timeline on top; owner bundle upload below when unlocked |

## API contract (base `/`)

- `GET /api/shop-settings` → `{shop_name, owner_whatsapp, currency, logo_url}`
- `GET /api/products?q=&category=&size=&max_price=` → `Product[]`
- `GET /api/products/:id` → `Product`
- `POST /api/person-upload` multipart `file` (+`crop`,`keepForDays`,`externalUserId`) → `{imageId, imageUrl}` (imageId ~7d TTL)
- `POST /api/try-on/sync` JSON `{product_id,title,description,image_url,person_image_id}` → `200 {generationId,status,resultImageUrl}` (temporary URL — download at once) or `202 {generationId,status}` → poll `GET /api/generations/:id` every 2s, ~90s cap
- `POST /api/owner/login` JSON `{token}` → `200 {ok:true}` or `401` (validates `OWNER_TOKEN`; empty secret = open v1)
- `POST /api/owner/logout` → `200 {ok:true}` (ack; browser clears the token)
- `POST /api/studio/products` Bearer-gated multipart `image0*` (garment), `image1` (model), `image2` (styled), `title*`, `price_cents`, `category`, `sizes` (csv), `description` → full `Product` (files to R2 `products/<id>-<slot>.<ext>`, row into D1; reads fall back to seed when bindings are absent)

`Product = {id,title,description,price_cents,currency,image_url,model_image_url,styled_image_url,r2_key,category,sizes[],created_at}`

## Rules (from the shop owner, non-negotiable)

1. **Olive-oil theme**: tokens in `styles/tokens.css` are law. No pill-shaped buttons (`border-radius: 10px`, search 12px). Poppins headings / Inter body.
2. **3-image bundle per product**: garment large + worn-model inset; tap inset swaps LARGE<->SMALL both ways; press-and-hold on the worn photo peeks the model WITHOUT it (release snaps back).
3. **Try-on studio is persistent + instant**: file pick + camera capture, client validation (10MB, JPEG/PNG/WebP/HEIC, ≥256px), hi-res downscale, **eager upload on pick** (`imageId` patched into the timeline entry, persists ~6d), sync-or-poll, result prepended to timeline top + **Download**. Timeline strip sits ABOVE the pick buttons so return visitors reuse a photo in one tap. Never auto-dismiss.
4. **Timeline**: newest-first strip of person photos + results in localStorage, namespaced per browser via a stable device id (`core/store.ts`, shown as `device XXXX`); click re-selects; photo survives product switches and visits. Owner login (`/app/studio.html?owner=1`, token verified by `POST /api/owner/login`, kept on-device, sent as Bearer, logout clears it) unlocks the bundle form on the same page.
5. **Inquire** opens `https://wa.me/<owner_digits>?text=...`; **Share** copies the product URL (SSR keeps OG tags for bots — worker-owned, don't remove).
6. No secrets in this folder. No Tailwind, no plain CSS files — StyleX only (`src/styles/*.stylex.ts`).
   Sacred classes live in HTML shells; `src/skin.ts` fuses them to hashed
   StyleX rules (the ONLY place literal classes meet styles).

## Sacred element ids (studio/swap JS binds exactly these)

`studio, st-product, st-prod, st-device, pick-file, pick-cam, st-prev, st-meta, st-welcome, st-err,
st-start, st-change, st-prog, st-res, st-resimg, st-dl, st-retry,
st-timeline, st-tlhead, data-pid/title/desc/img, data-garment/model/styled,
owner, owner-login, owner-panel, owner-gate, bundle-form, bd-token, bd-login, bd-login-err, bd-logout,
bd-use-result, file0/1/2, filecam, btn-photo, btn-cam, slot-img-0/1/2, bd-submit, bd-err, bd-ok, studio-list`
