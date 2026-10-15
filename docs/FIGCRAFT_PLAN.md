# FIGCRAFT DESIGN PLAN — tryon shop theme "Lime/Violet"

Status: plan. Theme is experimental and WILL change again — the pipeline
below makes a re-theme a tokens-only operation.

## 1. Theme

Direction: yellow-green (lime) primary + its complement violet.
Dark premium base so product photos pop. All values live as figcraft
variables AND as CSS custom properties — single source of truth both sides.

### Tokens (`tokens.figcraft`, collection `shop`)

| Token | Value | Use |
|---|---|---|
| `bg` | `#12140C` | page background (near-black olive) |
| `surface` | `#1B1F12` | cards, studio panel, admin form |
| `line` | `#2C3319` | borders, dividers |
| `text` | `#F4F7E4` | headings, body |
| `muted` | `#9AA07E` | hints, counts, meta |
| `primary` (lime) | `#B9D93C` | Try On buttons, active pills, prices, progress |
| `primary-ink` | `#1A2005` | text on primary buttons |
| `complement` (violet) | `#8B6FE8` | links, badges, focus rings, share buttons |
| `wa` (keep) | `#25D366` | WhatsApp buttons ONLY (brand recognition) |
| `danger` | `#FF7A7A` | errors |
| `radius` | `16px` / `999px` pills | corners |
| `font` | `Poppins` headings / `Inter` body | bundled OFL fonts (render proofs match browser) |

Modes: `dark` (default, above). A `light` mode later = second variable
mode only, zero component changes.

## 2. Components to build (`shop.figcraft`)

| Component | Variants / notes |
|---|---|
| `Topbar` | brand + Admin link |
| `Hero` | title, sub, search field, category pills (`All` + `on` state) |
| `ProductCard` | image 3:4, badge, title, price (lime), Try On (primary) + Inquire (wa outline) |
| `LandingGrid` | responsive 240px-min cards, count line, empty state |
| `TryOnStudio` | `Idle` / `Review` / `Working` / `Done` / `Error` — one variant per code phase |
| `DetailHead` | back link, big image, title, desc, price, inquire + share row |
| `ShareRow` | readonly link field + WhatsApp share button (violet) |
| `AdminForm` | photo buttons, preview, fields, submit, progress + ok/error states |

Screens (frames for proof renders): `Landing`, `Product`, `Admin`.

## 3. Build scripts (headless, agent-run)

Each step is a `figcraft-cli run` JSON script, committed under
`design/scripts/` so the design itself is reproducible:

1. `01-tokens.json` — create file, variable collection + all tokens above.
2. `02-card.json` — `Topbar`, `ProductCard` (auto-layout, hug/fill).
3. `03-grid.json` — `Hero`, `LandingGrid` + `Landing` frame.
4. `04-studio.json` — `TryOnStudio` 5 variants + `DetailHead` + `Product` frame.
5. `05-admin.json` — `AdminForm` + `Admin` frame.
6. After each: `figcraft-cli render shop.figcraft -o design/proofs/<step>.png --scale 2 --no-system-fonts`.

## 4. Extract (design -> code)

```
figcraft-cli run '[{"command":"variable.export","params":{"format":"css","path":"design/out/tokens.css"}}]' --in shop.figcraft
figcraft-cli run '[{"command":"inspect.code","params":{"id":"<ProductCard>","language":"leptos"}}]' --in shop.figcraft
figcraft-cli run '[{"command":"inspect.code","params":{"id":"<TryOnStudio/Review>","language":"leptos"}}]' --in shop.figcraft
```

`variable.export` css output REPLACES the `:root` block in
`client/styles/main.css`. Component Leptos output is static markup: class
names and structure are copied, behavior is hand-wired (see §5).

## 5. Wiring map (what survives the fusion)

Generated markup MUST keep these hooks or features break silently:

| Hook | Required in | Used by |
|---|---|---|
| `#studio` + `data-pid/title/desc/img` | SSR detail (`ssr.rs`) | studio JS bootstrap |
| `#pick-file`, `#pick-cam` (file inputs, `accept="image/*"`, cam has `capture="user"`) | SSR detail | photo picking |
| `#st-prev/#st-meta/#st-err/#st-start/#st-change/#st-prog/#st-res/#st-resimg/#st-dl/#st-retry` | SSR detail | studio state machine |
| `GET /` form (`q`, `category`), pills as `<a href="/?category=X">` | SSR landing | server filtering, no-JS |
| `og:*` / `twitter:*` head tags, canonical | SSR shell | WhatsApp/bot previews |
| `.share-link` readonly input + wa share `<a>` | SSR detail | sharing |
| Product props + signals (not ids) | `client/src/components/*` (Leptos) | WASM interactivity |

Rule: figcraft may rename anything EXCEPT the table above. When a
component changes shape, update BOTH `ssr.rs` template and the Leptos
twin so SSR HTML == WASM first render (hydration + SEO parity).

## 6. Proof loop

1. `render` PNG after every build script.
2. Fuse -> CI tag (`v0.1.x`) -> download wasm -> bun harness ->
   screenshot `localhost:8787` (`/`, `/product/dress-01`, `/admin`).
3. Side-by-side: figcraft PNG vs browser. Mismatch = fix tokens/markup,
   never browser-only CSS hacks.

## 7. Re-theme later (cheap by design)

1. Edit variable values (or add `light` mode) in `tokens.figcraft`.
2. Re-run `variable.export` -> replace `:root` -> commit.
3. No component, Rust, or JS changes needed unless contrast breaks
   (lime-on-lime text) — check proofs.

## 8. Phase order

- p1: tokens + proofs (this doc's §1 as `01-tokens.json`).
- p2: card + grid + landing proof.
- p3: studio variants + product proof.
- p4: admin + proof, extract, fuse, CI, browser compare.
