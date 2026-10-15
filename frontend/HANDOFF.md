# Frontend handoff (Astra build)

The Rust worker owns the **API only**. Everything visual lives here in
`frontend/` — TypeScript + StyleX, built with bun (`bun run build` -> `dist/`). Rebuild or
reskin freely; the contract below is stable.

## Run locally

```bash
# serves worker API + this folder at /app/
bun /tmp/opencode/wbg/harness4.cjs
# landing : http://localhost:8787/app/
```

## Pages

| File | Purpose |
|---|---|
| `index.html` | Shop landing shell (mounts only; `src/main.ts` boots by `data-page`) |
| `product.html?id=<id>` | Detail: gallery swap, inquire/share, try-on studio, timeline |
| `admin.html` | Owner bundle upload: garment + model + styled, fields, save |

## API contract (base `/`)

- `GET /api/shop-settings` → `{shop_name, owner_whatsapp, currency, logo_url}`
- `GET /api/products?q=&category=&size=&max_price=` → `Product[]`
- `GET /api/products/:id` → `Product`
- `POST /api/person-upload` multipart `file` (+`crop`,`keepForDays`,`externalUserId`) → `{imageId, imageUrl}` (imageId ~7d TTL)
- `POST /api/try-on/sync` JSON `{product_id,title,description,image_url,person_image_id}` → `200 {generationId,status,resultImageUrl}` (temporary URL — download at once) or `202 {generationId,status}` → poll `GET /api/generations/:id` every 2s, ~90s cap
- `POST /api/admin/products` multipart `image0*` (garment), `image1` (model), `image2` (styled), `title*`, `price_cents`, `category`, `sizes` (csv), `description` → `{id}`

`Product = {id,title,description,price_cents,currency,image_url,model_image_url,styled_image_url,r2_key,category,sizes[],created_at}`

## Rules (from the shop owner, non-negotiable)

1. **Olive-oil theme**: tokens in `styles/tokens.css` are law. No pill-shaped buttons (`border-radius: 10px`, search 12px). Poppins headings / Inter body.
2. **3-image bundle per product**: garment large + model inset; tap swaps; press-and-hold on the person shows the styled shot.
3. **Try-on studio is persistent**: file pick + camera capture, client validation (10MB, JPEG/PNG/WebP/HEIC, ≥256px), hi-res downscale, upload-once (`imageId` in localStorage ~6d), sync-or-poll, result + **Download**. Never auto-dismiss.
4. **Timeline**: newest-first strip of person photos + results in localStorage; click re-selects; photo survives product switches.
5. **Inquire** opens `https://wa.me/<owner_digits>?text=...`; **Share** copies the product URL (SSR keeps OG tags for bots — worker-owned, don't remove).
6. No secrets in this folder. No Tailwind, no plain CSS files — StyleX only (`src/styles/*.stylex.ts`).
   Sacred classes live in HTML shells; `src/skin.ts` fuses them to hashed
   StyleX rules (the ONLY place literal classes meet styles).

## Sacred element ids (studio/swap JS binds exactly these)

`studio, pick-file, pick-cam, st-prev, st-meta, st-welcome, st-err,
st-start, st-change, st-prog, st-res, st-resimg, st-dl, st-retry,
st-timeline, st-tlhead, data-pid/title/desc/img, data-garment/model/styled`
