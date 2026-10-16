# Studio spec - how the studio page must work

Single shared page (`/app/studio.html?id=<productId>&owner=1`): the shopper
try-on flow and the owner login + bundle upload live in the same place.
Feed "Try On" lands here with the product already selected.
Served by `bun run dev` (:8811, dev.ts) with `/api` proxied to :8787.
(Astro was removed in phase9; `src/*.astro` are dead files, do not edit.)

## 1. Entry

- [x] Feed card "Try On" links to `/app/studio.html?id=<productId>`.
  (`components/product-card.ts` - cardHTML)
- [x] Card image links to `/app/product.html?id=<productId>`.
- [x] Studio reads `?id=`; falls back to first product when missing.
  (`pages/studio.ts`)
- [x] Garment picker `<select id="st-prod">` switches product, keeps
  `&owner=1` when owner mode is on. (`pages/studio.ts`)

## 2. Product block on studio (same as feed card + user card duo)

Rule: the studio product view reuses the feed state machine, not a copy.

- [x] Large garment (G) + small inset model-wearing (S).
  (`galleryHTML` in `components/product-card.ts`, rendered by `pages/studio.ts`)
- [x] Tap inset swaps large/small. (`armSwap`, shared with feed + detail)
- [x] Hold worn large peeks model-without (M); release restores worn.
  (`armSwap` hold timer ~350ms)
- [x] Duo: product card + user-photo card side by side on desktop
  (grid 2 col); one full-width card per swipe step on mobile
  (100% snap track, lime arrow to advance), so nothing is cut and no
  dark gaps show at the sides (`duo` styles in
  `styles/panels.stylex.ts`, rendered by `pages/studio.ts`).
  The user photo lives in the duo card, not stacked below, so no
  extra vertical space is taken. The CTA appears under the duo once a
  ribbon photo is chosen.
- [x] Both cards fit the viewport (`max-width: min(100%, 52vh)` via
  `duo.fit` + `duo.user`), so the full view is never pushed off screen
  on mobile or desktop.
- [x] Picking or tapping a ribbon photo auto-scrolls the duo track to
  the user card (`ready()` scrolls `#st-duo` into view, but never on
  saved-photo restore, so the page always lands on the product card).
- [x] Tapping the large product image swaps garment/worn, like the
  inset button; hold on a worn view peeks the without-model photo
  (hold suppresses the follow-up tap). Same language on the user card:
  tap toggles full uncropped view, hold peeks the previous ribbon
  photo, release returns.
- [x] True fullscreen: the expand button on each photo frame shows ONLY
  that photo (Fullscreen API on the frame node itself, black backdrop).
  Same nodes stay mounted, so tap-swap and hold-peek keep working
  inside fullscreen; tap the button again (or ESC) to exit.
  (`toggleFs` + `.fs-btn` in `components/product-card.ts` /
  `components/duo.ts`; `:fullscreen` rules in styles)
- [x] Product page matches the studio page: same duo (product gallery +
  user card, swipeable on mobile), same ribbon, same CTA, same compare,
  same fullscreen. Shared via `components/duo.ts`
  (`duoHTML` + `armDuo`); detail info (title/price/inquire/share) sits
  below the duo.

## 3. Shopper photo slot

- [x] Take photo / Add photo ribbon tiles open the camera / library
  pickers (`label for="pick-cam"` / `for="pick-file"` in `paintTimeline`).
- [x] WASM validate + downscale first, canvas fallback.
  (`components/photo.ts` via imgpipe; glue served at `/imgpipe/` with
  correct MIME types from `frontend/imgpipe/`)
- [x] No upload on pick: the file is stored in this browser only
  (IndexedDB via `core/photo-store.ts`, keyed per timeline entry) and
  uploads only when Start is clicked. Ribbon photos therefore survive
  reloads and product switches with no network involved.
- [x] No Change button: whatever ribbon photo the user taps replaces
  the current photo (uploaded entries reuse imageId, fresh picks reuse
  the held file; genuinely file-less entries ask to be re-added).
- [x] Start shows a processing animation on the added image (pulse +
  "Processing your photo..." in `#st-prog`).
- [x] The processed photo replaces the old one in the user photo area;
  the result also goes first in the ribbon, so the photo behind it is
  the before view (tap it to see before, tap the result for after).
- [x] Timeline photo survives product switches; uploaded photos survive
  revisits (localStorage `tryon.person.v1`, ~6 day TTL; `core/store.ts`).
- [x] Compact modern CTA: full-width lime "Try it on" button
  (`.cta` in `styles/panels.stylex.ts`); device-hint line and
  uploading-note line removed to save space.
- [x] Download button on the result (result URLs expire, file does not).

## 4. Before/after compare

After try-on returns, the result sits on top of the user's own photo in
the same frame; hold or tap reveals the original underneath, so
before/after is visible in one view.

- [x] Result stacked over the user photo in one frame (`#st-cmp` with
  `#st-cmp-base` original + `#st-cmp-top` result; `compare` styles in
  `styles/panels.stylex.ts`, markup in `studio.html` + `product.html`,
  wired by `paintCompare` in `components/studio.ts`).
- [x] Press-and-hold top image peeks the original; release restores.
  Tap toggles pinned compare. Caption narrates the state.
- [x] Falls back to the single result image when no user photo is held
  or the frame markup is absent. Hidden again on retry / change photo.
- [x] Same interaction language as the feed hold-to-compare.

## 5. Timeline

- [x] Newest-first strip of person photos + results, tap to reuse.
  (`components/timeline.ts`, storage in `core/store.ts`, cap 12)
- [x] Person entries carry `{ kind, thumb, imageId, ts }`; result
  entries carry `{ kind, thumb, url, ts }`.
- [x] Selecting a person entry restores it as the active photo;
  selecting a result shows it in `#st-res`.

## 6. Owner section (same page, gated)

- [x] `?owner=1` or saved token reveals `#owner`, hides `#owner-gate`.
  (`pages/studio.ts`)
- [x] Token login/logout, token persisted (`core/store.ts` - saveOwner).
- [x] 3-slot bundle form: garment *, model-without *, styled
  (upload or "use last try-on"). (`components/owner-form.ts`)
- [x] Save posts multipart to `POST /api/studio/products`;
  new bundle appears on the landing grid.

## 7. Local run (see docs/LOCAL_RUN.md)

- [x] `bun run dev` serves the plain shells on :8811, proxies `/api`
  to the worker harness on :8787.
- [x] Harness serves products + upload persistence locally.

## 8. Photo ribbon UX (timeline as floating ribbon)

The ribbon IS the photo interface. There is no "Virtual try-on" card and
no separate picker box: that whole area was removed to save mobile space.
The ribbon is always visible in the studio flow, including when empty.

- [x] Leading tiles: Take photo (camera tile, opens the camera picker)
  first, then Add photo (+ tile, opens the library picker), then the
  timeline thumbs - all in one horizontal scroll.
  (`paintTimeline` renders `label for="pick-cam"` + `label for="pick-file"`;
  `timeline.take` / `timeline.add` styles)
- [x] Tapping any ribbon photo inserts it into the user photo area
  (person entries become the active photo via selectEntry; result
  entries show in `#st-res`).
- [x] Floating: on mobile the ribbon is a sticky bottom bar (surface
  pill, shadow, z-index) that stays in reach while scrolling; on web it
  is an inline scroll row with the same tiles first.
  (`timeline.row` sticky rules in `styles/panels.stylex.ts`)
- [x] No boxed studio section on any viewport (`studio.root` is
  borderless/transparent; content flows, ribbon floats).
- [x] Responsive fixes shipped with the ribbon: owner list margin no
  longer hard-codes 560px on mobile; garment picker goes full width
  under 720px; compare frame is fluid (max 440px).
