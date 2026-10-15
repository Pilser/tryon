---
name: figcraft-fusion
description: Fuse figcraft designs into the tryon shop so served pages ARE the design, not hand-written lookalikes. Load before any design or shop-UI work. Enforces extract-to-serve pipeline, sacred hook ids, proof discipline, and the no-round-buttons visual law.
---

## Skill boundaries

- Use this skill when the deliverable is shop UI code (SSR templates,
  CSS, Leptos components) derived from `design/shop.figcraft`.
- Pure canvas work (new frames, variants) needs no other skill — use
  `figcraft-cli run` scripts.
- Build/test/CI rules live in `AGENTS.md` and override everything here on
  conflict (RAM wrappers, release-only CI, no local `cargo build`).
- Architecture and phase order live in `docs/ARCHITECTURE.md`;
  the design plan in `docs/FIGCRAFT_PLAN.md`.

## Required workflow (in order, do not skip)

### 1. Context first, never assumptions

- `figcraft-cli info design/shop.figcraft --json` for the frame map.
- `inspect.code {id, language: html}` per component into `design/out/`.
- `variable.export {format: css}` into `design/out/tokens.css`.
- Large tree? `info` first, then per-node extracts (never one giant dump).

### 2. Screenshot as source of truth

- `figcraft-cli render --no-system-fonts` (design truth).
- Headless-Chrome screenshot of the served page at the same viewport.
- Keep both visible while working; ship only on visual match.

### 3. Assets: no placeholders in production

- Product/model/styled triples come from the `Product` struct or seed —
  never grey boxes in served markup (placeholders allowed in design
  proofs only). Icons as inline SVG from the export, never new packages.

### 4. Translate, don't transliterate

- Export HTML is the template: copy structure, classes, radii, spacing,
  fonts verbatim; replace only static text with `esc()` placeholders.
- Map to project tokens (`var(--primary)` etc.), never pasted hex.
- Reuse existing components; extend, don't duplicate.

### 5. Responsive mapping (only allowed deviation)

Fixed 300px card + `flex-wrap` grid at design gap (30px); 1200px frames
become `max-width:1200px` centered containers; absolute children keep
exact px on desktop; below 720px stack columns. Comment each media query
with its source frame.

### 6. Validate before marking complete

Layout, typography (family/size/weight), colors (exact hex), states
(hover/pressed/focus/disabled), responsive behavior, OG/bot tags,
sacred hook ids intact, `python3 design/fuse.py` prints `FUSED: no drift`,
bloat gate passes (≤500 lines/file).

### 7. Document deviations

Any deliberate departure from the export gets a code comment starting
with `DEVIATION:` explaining why (a11y, responsiveness, technical
constraint). Unexplained drift is a defect.

## Sacred hooks (renaming silently kills features)

`#studio` + `data-pid/title/desc/img`, `#pick-file`, `#pick-cam`
(`capture="user"`), `#st-prev/#st-meta/#st-welcome/#st-err/#st-start/#st-change/#st-prog/#st-res/#st-resimg/#st-dl/#st-retry`,
`#st-timeline` + `#st-tlhead`, `.productcard` + `data-garment/model/styled`
+ `img.main/.model-inset/.swap-cur`, `og:*`/`twitter:*` + canonical,
`GET /` fields `q`/`category`. Studio/swap JS binds exactly these.

## Visual law (user directive, non-negotiable)

No round pill buttons: buttons/pills/inputs `border-radius: 10px`
(search 12px). Lime `#B9D93C` primary (+`primary-hover`/`primary-pressed`
for hover/pressed), violet complement for focus/links/share, WhatsApp
green ONLY on WhatsApp buttons. Poppins headings / Inter body (bundled
OFL fonts only — nothing the renderer substitutes). Lime-on-dark and
ink-on-lime pairs already pass WCAG AA; verify any new pair before use.

## 3-image bundle (per product, always)

Garment flat + model WITHOUT garment + model WEARING it. Card shows
garment large with model inset; tap swaps; press-and-hold on the person
shows the styled shot. `model_image_url`/`styled_image_url` ride the
`Product` struct (`serde(default)`); empty styled degrades to swap-only.
In figcraft every card MUST show the inset rect (parented, bound) — a
card without a visible model slot is incomplete by definition.

## figcraft command facts (re-learned painfully)

- `run --out` needs an ABSOLUTE path; relative silently writes nothing.
- `node.create` ignores top-level `cornerRadius`/`stroke*` — follow with
  `node.set {ids, ...}`. Find ids via `select.layersAt {x, y}`.
- Two-phase nesting: create frame → read id → children with
  `"parent": ID` + LOCAL coords. `textAlignVertical`: `top|middle|bottom`.
- `variable.bind {field: fill, variable: NAME}` works on rects AND texts.
- `export --node NAME` gives per-component PNGs for tight proof loops.
- Loose page-level layers break extracts (shallow output) — reparent or
  rebuild; never leave a frame visually complete but structurally empty.
- `edit.findReplace` needs `"regex": true`; layer-name search is
  unreliable — prefer coordinate probing.
