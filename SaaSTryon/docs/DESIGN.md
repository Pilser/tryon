# DESIGN.md — the SaaSTryon interface specification

Written 2026-10-20. Companion files: [`PLATFORM.md`](./PLATFORM.md) (the
architecture and the live findings), [`SHOP-API.md`](./SHOP-API.md) (every
endpoint this spec talks to), [`PLAN-UX.md`](./PLAN-UX.md) (the working plan
for the platform UI — this file supersedes it for structure and supersedes
`landing.html` for the public page).

This document specifies **three surfaces**:

| # | Surface | URL | Auth | Data source |
|---|---|---|---|---|
| A | Public landing | `https://latiforge.com/` → `dist/index.html` | none | demo shop `/api/feed`, optional `/api/v1/public/stats` |
| B | Owner console | `https://latiforge.com/home.html` | owner session (`sess_…`) | `/api/v1/me`, `/api/v1/shops`, `/api/v1/shops/activity`, `/api/v1/shop/*` |
| C | Admin console | `https://latiforge.com/admin.html` | `ADMIN_TOKEN` (in memory only) | `/api/v1/admin/*` |

Rules that bind every surface, from the house style (`kit.ts`,
`ui.stylex.ts`, `platform.stylex.ts`, `base.stylex.ts`):

- olive theme — bg `#12140c`, surface `#1b1f12`, line `#2c3319`, lime
  `#b9d93c` (primary), violet `#8b6fe8` (complement), red `#ff7a7a`
  (destructive). **Only the token vars — never a literal colour.**
- Poppins for headings, Inter for body (`tokens.fontHead` / `tokens.fontBody`).
- **No round buttons and no pills.** Interactive elements (button, chip,
  input, tile, tab) cap at **10px radius**. Cards keep the kit's 14px.
  A chip is a 7px-radius label, never a fully-rounded capsule.
- Destructive actions are **red** (`base.btnDanger`) **and confirmed**;
  irreversible ones require the subject's name to be typed.
- Dense but calm: 13–14px rows, hairline separators (`u.hairline`), one
  accent (lime), one complement (violet), red only for danger. It is a
  working tool, not a toy.
- StyleX classes are **self-contained**: one class holds the whole rule
  set, no runtime merging, no conflicting properties across two classes.
- Frontends call the platform **only** through `POST/GET /api/v1/…`
  (`api.ts`, `api-admin.ts`). Never `platform/src/**`, never `std::process`.

---

## 1. Principles (8 rules, with the research behind each)

### P1 — One primary action per screen. Everything else is a tab, a row action, or a link.
*Research:* "Pages deliberately expose one primary action; everything else
lives in the overflow menu" ([Nyumba Zetu, navigating the app](https://www.nyumbazetu.com/docs/getting-started/navigating-the-app)).
For public pages: "One primary CTA above the fold. Not five CTAs; one" and
"The hero has one self-serve CTA and, if you sell to larger accounts, one
sales CTA. No third button" ([InBuild](https://www.inbuild.io/guides/saas-landing-page),
[Flow Agency](https://www.flow-agency.com/blog/b2b-saas-landing-page-best-practices/)).
*Applied:* each console tab has exactly one primary button, in the page
header, right-aligned. The owner console's is **Deploy a shop**; the admin
console's changes per tab (**Approve** on Requests, **Upload a version** on
Bundles, **Mint codes** on Codes). The landing page's is **Request a shop**.

### P2 — Lists over walls. A screen shows one list at a time; detail opens beside it.
*Research:* the operator-console rule "Use resource detail pages for durable
objects… Use drawers for short-lived inspection… Modals only for
confirmation, creation, and credential reveal"
([Nimbus DESIGN.md](https://github.com/nimbus/nimbus/blob/main/DESIGN.md));
"a record opened from a list slides over the page rather than replacing it"
([Nyumba Zetu](https://www.nyumbazetu.com/docs/getting-started/navigating-the-app)).
*Applied:* today each shop is a 270-line card with eight stacked sections
(`components/shop-list.tsx`). It becomes a **small tile** in a grid; clicking
the tile **expands a manage panel inline** (the panel is the tenant's
durable object, so it is a full region, not a 480px drawer that hides the
list).

### P3 — Empty states are designed moments: the reason, then the next action.
*Research:* Stripe's rule — "Explain why it's empty", "Guide users toward
the next action", title/action as call-and-response ("No customers yet." →
"Add customer"), and the strict render order **loading → error → empty →
content** ([Stripe empty states](https://docs.stripe.com/stripe-apps/patterns/empty-state)).
*Applied:* no screen ever shows a bare "No results". Every empty state has a
one-line reason, one action, and — when a filter is active — a "Clear
filters" escape hatch.

### P4 — Bulk actions are explicit about scope; destructive ones are red and confirmed.
*Research:* NN/g bulk-action guidelines as relayed — a contextual action bar
appears the moment a row is selected, "select all 4,200 matching" must be
said out loud, and destructive bulk actions confirm with the count quoted
([artofstyleframe](https://artofstyleframe.com/blog/admin-panel-layouts-saas-dashboard/)).
"selecting any row swaps the filter bar for a bulk-action bar **in place**
(no layout shift)" ([shipit dashboard skill](https://github.com/shipiit/shipit-ui-design/blob/main/skills/dashboard-design/SKILL.md)).
The delete-shop flow already requires the shop name to be typed
([SHOP-API.md §1.7b](./SHOP-API.md)).
*Applied:* a sticky bulk bar with `N selected`, `Clear`, and a
**preview of exactly what changes** before the confirm.

### P5 — Save is not publish. Uploads stage; publishing is a separate, explicit, previewed step.
*Research:* Shopify — "Publish doesn't save your work. It makes your changes
visible to your customers", publish is a dialog that reviews the change,
and the previously published theme stays in the library as a rollback
([Shopify Canvas](https://help.shopify.com/en/manual/online-store/themes/canvas/customizing),
[Atlas guide](https://intercom.help/helloatlas/en/articles/16913061-how-to-safely-edit-test-and-publish-shopify-themes)).
Webflow — the publish workflow shows a **pre-publish summary** and a
staging → production split ([publishing workflow](https://help.webflow.com/hc/en-us/articles/46651740529811-Publishing-workflow)).
*Applied:* the landing upload queues files in a staging table; **Publish**
is a separate button that reports `files`/`uploaded` and the live URL.
A version is **uploaded** (an artifact exists) and **assigned** (tenants
move onto it) — never the same action.

### P6 — The URL is the state.
*Research:* "Filters and quick-view chips are written into the URL.
Bookmark a filtered grid — or paste the URL into a message — it reopens
exactly as you left it" ([Nyumba Zetu](https://www.nyumbazetu.com/docs/getting-started/navigating-the-app)).
"Every filter, sort, selected resource, drawer, and tab position must be
reflected in the URL" ([Nimbus](https://github.com/nimbus/nimbus/blob/main/DESIGN.md)).
*Applied:* `?tab=`, `?shop=`, `?q=`, `?status=` on every console; the
landing page's demo section is `?demo=1`-linkable. No routing library —
`URLSearchParams` + `history.replaceState` is enough.

### P7 — Numbers over adjectives. Every claim is countable, and the count comes from us.
*Research:* try-on landing pages that convert publish their own numbers and
their own arithmetic rather than adjectives: Figur shows every assumption
and says "sometimes the answer is no" ([Figur](https://figur.fit/shopify));
PreviewAI ships a ROI calculator with the formula visible
([PreviewAI](https://www.previewai.app/)); Dressie publishes a funnel table
with its date range and sample size ([Dressie](https://dressie.ai/eng)).
And: "If you have zero customers because you just launched, skip the logo
bar entirely; don't fake it" ([InBuild](https://www.inbuild.io/guides/saas-landing-page)).
*Applied:* the landing page counts what it can actually count (garments in
the demo catalogue, shops live, try-ons served) and shows **no invented
logos or testimonials**. If a number is not available, the page says the
capability instead of the number.

### P8 — Dense, calm, and honest about what is happening.
*Research:* the admin-table baseline (sticky header, numeric alignment,
skeleton rows that preserve geometry, compact empty state with the next
action) from the [shipit dashboard skill](https://github.com/shipiit/shipit-ui-design/blob/main/skills/dashboard-design/SKILL.md);
upload honesty — per-file state, a queue, honest aggregate progress,
retry that never discards completed work
([Filestack](https://blog.filestack.com/bulk-upload-ui-queues-partial-success/),
[CoreUpload](https://coreupload.com/Learn/FolderUploads)).
*Applied:* 13px table rows, hairline separators, no hover lifts on tables,
per-file upload state, and a **never-lying** aggregate bar weighted by bytes.

---

## 2. The public landing page — `/index.html`

### 2.1 What it is today, and what it becomes

Today `platform/frontend/src/landing.html` is a static, hand-styled HTML
file: one eyebrow, one headline, three text cards, three buttons, a footer.
It is copied to `dist/index.html` by `build.ts:67`. It says nothing about
the try-on, shows no garment, and gives the visitor no reason to believe
the product exists.

It becomes a **React page** (`pages/landing.tsx` + `src/landing.html`
shell) so it reuses the kit (`u.*`, `pf.*`) and ships the same hashed
stylesheet and cache tags as the consoles. `build.ts` gains `"landing"` in
`PAGES` and copies `dist/landing.html` → `dist/index.html`.

Content rules for this page:

- It must answer, in the first screen: **what is this, who is it for, what
  does it cost, and can I see it working?** ([SaaSHero](https://www.saashero.net/content/effective-saas-landing-page-structure/))
- Every section shows **real product UI or real product photos** — never
  abstract illustrations ("Product sections show real UI, not stock
  illustrations", [reverbico](https://reverbico.com/blog/saas-website-examples/)).
- It must work on a phone: CTA visible without scrolling, images lazy,
  feed grid 1 column below 720px.

### 2.2 Section map

| ID | Section | The job it does | Real content it must show |
|---|---|---|---|
| S0 | Top nav | orientation + one primary | Brand, 4 links, `Sign in`, `Request a shop` |
| S1 | Hero | what/who/how + one CTA | Headline, sub, `Request a shop`, **live try-on iframe** from the demo shop |
| S2 | Live catalogue | proof it works, right now | Product cards pulled from the demo shop's `/api/feed` |
| S3 | How it works | comprehension (4 steps) | Request → catalogue → publish landing → order |
| S4 | What you get | the four capabilities | 4 cards, each with a real screenshot of the studio / feed / credits / landing publisher |
| S5 | Who it is for | self-selection | 3 audience cards (shop / studio / brand) |
| S6 | The numbers | credibility | shops live, try-ons served, garments in the demo catalogue, one saved-return line |
| S7 | Pricing | the money objection | 3 tiers, middle recommended, credit top-ups explained |
| S8 | FAQ | the remaining objections | 6 questions, paragraph answers |
| S9 | Final CTA | the last click | the promise restated + `Request a shop` |
| S10 | Footer | the sitemap | product, pricing, docs, status, platform admin link |

### 2.3 The wireframe

```
┌────────────────────────────────────────────────────────────────────────────┐
│ LATIFORGE            How it works  Shops  Pricing  FAQ     [Sign in] [Request a shop] │  S0
├────────────────────────────────────────────────────────────────────────────┤
│  VIRTUAL TRY-ON FOR GARMENT SHOPS                                          │
│                                                                            │
│  Let shoppers try your garments on.                                         │
│  Keep the orders.                                                          │
│                                                                            │
│  Latiforge deploys a try-on storefront on your own domain, wires it to    │
│  your catalogue, and meters every generation — so you pay for try-ons,     │
│  not for software you do not use.                                          │
│                                                                            │
│  [ Request a shop ]   Sign in · See a live shop →                         │
│                                                                            │
│  ┌────────────────────────────────────┐  ┌───────────────────────────────┐ │
│  │ LIVE FROM OUR DEMO SHOP            │  │  A working fitting room,      │ │
│  │ ┌────────────────────────────────┐ │  │  not a mock-up.               │ │
│  │ │  iframe: demo shop            │ │  │                               │ │
│  │ │  /app/product.html?id=<id>     │ │  │  1  Upload a photo            │ │
│  │ │  (the real try-on UI)         │ │  │  2  See the garment on you    │ │
│  │ └────────────────────────────────┘ │  │  3  Confirm on WhatsApp       │ │
│  │  Try it yourself →  open in demo   │  │                               │ │
│  └────────────────────────────────────┘  │  [ open the demo shop → ]     │ │
│                                           └───────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────┤
│  LIVE CATALOGUE — 8 garments from our demo shop            [open demo →]  │  S2
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │
│  │ photo  │ │ photo  │ │ photo  │ │ photo  │ │ photo  │ │ photo  │        │
│  │ Wax    │ │ Scarlet│ │ Ankara │ │ Kitenge│ │ Boucle │ │ Linen  │        │
│  │ coat   │ │ dress  │ │ shirt  │ │ kaftan│ │ cardig.│ │ shirt  │        │
│  │ 450,000│ │ 320,000│ │ 180,000│ │ 260,000│ │ 240,000│ │ 95,000 │        │
│  │ UGX    │ │ UGX    │ │ UGX    │ │ UGX    │ │ UGX    │ │ UGX    │        │
│  │ [Try on]│ │[Try on]│ │        │ │        │ │        │ │        │        │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘        │
│  Every card runs the real try-on. Prices and photos come from the shop.   │
├────────────────────────────────────────────────────────────────────────────┤
│  HOW IT WORKS                                                             │  S3
│  01 Request your shop     02 Add your catalogue                          │
│  email + WhatsApp →       garment photos, prices, sizes →                │
│  we approve, you get      the studio on your phone                       │
│  your address                                                        │
│  03 Publish your page     04 Get the order                              │
│  upload your dist →       the shopper tries on, you take                 │
│  it serves at your        the order on WhatsApp                          │
│  domain, /api/feed                                                     │
├────────────────────────────────────────────────────────────────────────────┤
│  WHAT YOU GET                                                            │  S4
│ ┌──────────────────┐ ┌──────────────────┐ ┌───────────────────────────┐  │
│ │ Try-on built in  │ │ Your domain,     │ │ Pay per try-on            │  │
│ │ [screenshot:     │ │ your catalogue   │ │ [screenshot: credits     │  │
│ │  product page    │ │ [screenshot:     │ │  ledger]                  │  │
│ │  try-on]         │ │  studio]         │ │                           │  │
│ └──────────────────┘ └──────────────────┘ └───────────────────────────┘  │
│ ┌──────────────────┐ ┌───────────────────────────────────────────────┐  │
│ │ Published by you │ │ Your customers, not ours                      │  │
│ │ [screenshot:     │ │ We never sell your catalogue or your shoppers. │  │
│ │  landing upload] │ │                                               │  │
│ └──────────────────┘ └───────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────────────────┤
│  FOR WHO                                                                │  S5
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐             │
│  │ Garment shops  │  │ Studios &      │  │ Brands &       │             │
│  │ retail ready-  │  │ collections    │  │ tailors        │             │
│  │ to-wear stock  │  │ made-to-order  │  │ one collection,│             │
│  └────────────────┘  └────────────────┘  └────────────────┘             │
├────────────────────────────────────────────────────────────────────────────┤
│  THE NUMBERS                                                            │  S6
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐           │
│   │ 12       │  │ 1,480    │  │ 8        │  │ 1            │           │
│   │ shops    │  │ try-ons  │  │ garments │  │ saved return │           │
│   │ live     │  │ served   │  │ in demo  │  │ = 1 month    │           │
│   └──────────┘  └──────────┘  └──────────┘  └──────────────┘           │
├────────────────────────────────────────────────────────────────────────────┤
│  PRICING — one try-on = one credit                                        │  S7
│  ┌───────────────┐  ┌═══════════════════┐  ┌────────────────────────┐   │
│  │ Free          │  │ Studio  ★         │  │ Growth                 │   │
│  │ $0            │  │ $19 / month        │  │ $49 / month            │   │
│  │ 1 shop        │  │ 3 shops            │  │ 10 shops               │   │
│  │ 10 try-ons/mo │  │ 100 try-ons/mo     │  │ 500 try-ons/mo         │   │
│  │ …             │  │ own domain         │  │ own domain + CNAME     │   │
│  │ [Request]     │  │ landing publisher  │  │ studio analytics       │   │
│  │               │  │ [Request a shop]   │  │ [Request a shop]       │   │
│  └───────────────┘  └═══════════════════┘  └────────────────────────┘   │
│  Credits never expire. Extra try-ons: $0.15 each (Studio) / $0.10        │
│  (Growth). A credit is one generation — nothing else is billed.           │
├────────────────────────────────────────────────────────────────────────────┤
│  FAQ                                                                    │  S8
│  Do I need to write code? · Whose domain is it? · What happens to my     │
│  photos? · How do I get more try-ons? · Can I bring my own landing      │
│  page? · How long until my shop is live?                                  │
├────────────────────────────────────────────────────────────────────────────┤
│  Your catalogue, wearable. One try-on at a time.                         │  S9
│  [ Request a shop ]      No card. We approve within a working day.        │
├────────────────────────────────────────────────────────────────────────────┤
│  Latiforge · Product · Pricing · Docs · Status · Platform admin →        │  S10
└────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Hero copy (final wording)

- **Eyebrow** (`pf.eyebrow`): `VIRTUAL TRY-ON FOR GARMENT SHOPS`
- **H1** (`pf.heroTitle`): `Let shoppers try your garments on.` / `Keep the orders.`
  The second line is lime. The headline names the **outcome** (try-on → order)
  and the **audience** (garment shops), never a category claim
  ("Shop Boss saw 305% more conversion after a headline rewrite"
  — [SaaSHero](https://www.saashero.net/content/effective-saas-landing-page-structure/)).
- **Sub** (`pf.heroLead`): `Latiforge deploys a try-on storefront on your own
  domain, wires it to your catalogue, and meters every generation — so you
  pay for try-ons, not for software you do not use.`
- **Primary CTA**: `Request a shop` → `/signup.html`
- **Secondary**: `Sign in` → `/login.html` (secondary button, not a link that
  looks like a button)
- **Text link**: `See a live shop →` → the demo shop URL
- **Hero visual**: the demo shop's real product page in an iframe
  (`pf.iframe`, 16:10, `loading="lazy"`, `title="Live try-on from our demo
  shop"`), with the caption `A working fitting room, not a mock-up.` and the
  fallback link `open the demo shop →`.

### 2.5 Proof and feature sections — what must be real

| Slot | What it must contain | Where it comes from |
|---|---|---|
| S2 card image | the garment photo | `items[].image` of the demo feed (absolute URL on the demo shop's `/media/…`) |
| S2 card title | the product title | `items[].title` |
| S2 card price | `45,000 UGX` | `items[].price_cents` / `items[].currency` via `Intl.NumberFormat` |
| S2 card link | `Try on` → `{origin}/product/{id}` (302 → the shop's product page with the try-on) | `items[].url` |
| S4 screenshot 1 | the shop's product page with the try-on panel | a screenshot of the demo shop, committed to `platform/frontend/src/assets/` |
| S4 screenshot 2 | the studio (catalogue + prices + sizes) | ditto |
| S4 screenshot 3 | the credits ledger (granted / used / left) | ditto |
| S4 screenshot 4 | the platform's landing-file publisher | ditto |
| S6 numbers | shops live / try-ons served | `GET /api/v1/public/stats` (new, public, tiny) — **degrade gracefully**: if it 404s, the tile shows `—` and the section still renders the two counts we *can* compute |

No customer logos, no testimonial carousel, no stock photography. If the
demo shop is down, S2 renders the committed fallback snapshot
(`src/assets/demo-feed.json`) with a `live feed unavailable` note, never an
empty grid.

### 2.6 Pricing / packaging shape

The market reference (verified 2026-07 / 2026-10 on the vendors' own pages):
try-on is sold as a **subscription plus metered generations**, with the
entry tier around $20 and the overage around $0.10–0.17 per generation
([Antla's price comparison](https://antla.io/blog/virtual-try-on-software-cost),
[TryOn Virtual's 2026 price table](https://tryonvirtual.com/blog/virtual-try-on-pricing)).
Three tiers ascending, middle recommended, is the canonical shape
([InBuild](https://www.inbuild.io/guides/saas-landing-page);
"more than four is a leak").

**The packaging we publish:**

| | Free | Studio ★ | Growth |
|---|---|---|---|
| Platform fee | $0 | $19 / month | $49 / month |
| Shops (deploy allowance) | 1 | 3 | 10 |
| Try-ons included / month | 10 | 100 | 500 |
| Extra try-on | — | $0.15 | $0.10 |
| Your own domain | — | ✔ | ✔ |
| Publish your own landing page | — | ✔ | ✔ |
| Studio analytics + lead capture | — | — | ✔ |
| Support | community | email | priority |

Line under the grid, verbatim:

> Credits never expire. One credit is one generation — hosting, the studio
> and your landing page are included in the platform fee. Extra try-ons are
> charged per generation, never per product or per visitor.

**Honesty constraint (load-bearing).** The platform's billing today is
manual: `credits.granted_total` / `used_total` and an admin approval queue
([SHOP-API.md §1.6](./SHOP-API.md)). There is no card checkout. So:

- The page may show these tiers as **the plan the platform grants**, and the
  CTA is `Request a shop` — the admin sets `shops.tier` and the allowance.
- The page must **not** show a "Start free trial" button or a card form
  until self-serve billing exists.
- The "Free" tier must be honest about the 10 try-ons: it is the current
  grant, not a promise of an unlimited trial.

The numbers above map onto fields that already exist:
`users.deploy_allowance` (= shops) and `credits.granted_total`
(= try-ons included). Nothing in the price table requires a schema change.

### 2.7 CTA plan

| Where | Label | Target | Style |
|---|---|---|---|
| S0 nav | `Request a shop` | `/signup.html` | `b.btn` + `b.btnPrimary` |
| S0 nav | `Sign in` | `/login.html` | `b.btn` + `b.btnSecondary` |
| S1 hero | `Request a shop` | `/signup.html` | `b.btn` + `b.btnPrimary` + `u.btnGrow` |
| S1 hero | `Sign in` | `/login.html` | `b.btn` + `b.btnSecondary` |
| S1 hero link | `See a live shop →` | demo shop URL | `pf.textLink` (complement colour) |
| S2 header | `open the demo shop →` | demo shop URL | `pf.textLink` |
| S7 tier card | `Request a shop` (Free / Studio) | `/signup.html` | `b.btn` + `b.btnSecondary` |
| S7 tier card | `Request a shop` (Studio ★) | `/signup.html` | `b.btn` + `b.btnPrimary` |
| S9 band | `Request a shop` | `/signup.html` | `b.btn` + `b.btnPrimary` + `u.btnGrow` |

Rule: the CTA label always names the next step ("Request a shop"), never
"Learn more" ([reverbico](https://reverbico.com/blog/saas-website-examples/)).
Secondary CTAs are visually secondary (secondary button or a text link in
`complement`), never a second lime button.

### 2.8 Where the real product photos come from

**Rule: every garment photo on the landing page is a real product from a
real demo shop. Nothing is mocked, nothing is stock.**

1. **The demo shops.** The platform runs its own shops on the same control
   plane, on the same zone: `https://{sub}.latiforge.com`. Two are pinned as
   public demos (documented in `PLATFORM.md`):
   - `demo` — a retail garment shop (mixed stock: wax coat, Ankara shirt,
     kitenge kaftan, bouclé cardigan, linen shirt).
   - `atelier` — a made-to-order studio/collection (for S5's audience cards).
   The canonical URLs live in **one** place,
   `platform/frontend/src/demo.ts`:

   ```ts
   export const DEMO = {
     shop: "https://demo.latiforge.com",
     feed: "https://demo.latiforge.com/api/feed",
     studio: "https://demo.latiforge.com/app/studio.html?owner=1",
     fallback: "./assets/demo-feed.json",
   } as const;
   ```

2. **The feed.** `GET {DEMO.feed}` is public, CORS-open
   (`access-control-allow-origin: *`) and cacheable
   (`public, max-age=60, s-maxage=300`)
   ([SHOP-API.md §2.1](./SHOP-API.md)), so the apex page may fetch it
   directly. It returns:

   ```json
   { "shop": { "name": "...", "logo": "https://demo.latiforge.com/media/products/shop-logo.png",
               "url": "https://demo.latiforge.com",
               "studio": "https://demo.latiforge.com/studio" },
     "items": [ { "id": "p1a2b3c", "title": "Wax coat", "price_cents": 450000,
                  "currency": "UGX",
                  "image": "https://demo.latiforge.com/media/products/p1a2b3c-garment.jpg",
                  "url": "https://demo.latiforge.com/product/p1a2b3c",
                  "category": "Jackets", "sizes": ["M", "L"] } ] }
   ```

   The landing page renders `items[]` — image, title, price, and a `Try on`
   link to `items[].url` (302 → `/app/product.html?id=…`, the real try-on
   page). `shop.logo` is the brand mark in S2's header; `shop.studio` is the
   link behind S4's "the studio" screenshot caption.

3. **The try-on demo (S1).** The hero iframe points at the demo shop's
   product page: `{DEMO.shop}/app/product.html?id=<first item id>`. That is
   the shop's own React try-on UI, running the real API
   (`POST /api/person-upload` → `POST /api/try-on/sync` → poll
   `GET /api/generations/:id`). No fake widget, no recorded video. The frame
   carries a caption and an `open the demo shop →` link for people whose
   browser blocks framing.

4. **Fallback.** `src/assets/demo-feed.json` is a committed snapshot of the
   demo feed (taken at build time by hand or by CI). If the live fetch
   fails, the page renders the snapshot and says
   `live feed unavailable — showing our last snapshot`. The grid is never
   empty.

5. **Screenshots for S4** are real screenshots of the platform and the
   studio, committed under `platform/frontend/src/assets/` (PNG, ≤ 200 kB,
   `loading="lazy"`, with `alt` text that says what the screen shows). They
   are never redrawn illustrations.

### 2.9 The feed embed the landing page uses

```ts
/* components/landing/feed.ts - the demo catalogue. One fetch, one render
   list, one fallback. The feed is CORS-open, so the apex page can read
   it directly (SHOP-API.md 2.1). */
export async function loadDemoFeed(signal?: AbortSignal): Promise<DemoFeed> {
  try {
    const res = await fetch(DEMO.feed, { signal, cache: "default" });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as DemoFeed;
  } catch (e) {
    const res = await fetch(DEMO.fallback, { signal });
    return (await res.json()) as DemoFeed;   // committed snapshot
  }
}
```

---

## 3. The owner console (signed-in platform user)

`https://latiforge.com/home.html` — the token-card gate (`TokenCard`,
`tryon.platform.v1` key), then the console.

### 3.1 Tab map

| Tab | URL | What it shows | **Primary action** | API used |
|---|---|---|---|---|
| **Shops** (default) | `?tab=shops` | the owner's shops as **small tiles**; clicking a tile expands the manage panel; the deploy form | `Deploy a shop` | `GET /api/v1/me`, `GET /api/v1/shops` |
| **Landing** | `?tab=landing` | a shop switcher + the **folder upload** queue + the published file list | `Publish landing page` | `GET /api/v1/shop/landing`, `POST …/landing/file`, `POST …/landing/apply` |
| **Credits** | `?tab=credits` | per-shop credit balances, totals, and the request-more action | `Request more credits` | `GET /api/v1/shops` + shop-side `POST /api/studio/tokens/request` |
| **Codes** | `?tab=codes` | the platform 4-digit codes this owner minted for their shops | `Mint codes` | `POST /api/v1/shop/tokens` |
| **Activity** | `?tab=activity` | the owner's audit feed (all rows, filterable) | — (search only) | `GET /api/v1/shops/activity` |
| **Settings** | `?tab=settings` | email, contact, shop name, deploy allowance readout, session | `Save` | `GET /api/v1/me` |

Rules: the tab strip is `pf.tabs` / `pf.tab` / `pf.tabOn` (already in the
kit), the active tab is written to the URL, and the console opens on
`?tab=shops`. The tab strip is **not** the page's primary action — the
primary action sits in the page header (`u.header`), right-aligned.

### 3.2 The shop tiles

```
┌──────────────────────────┐  ┌──────────────────────────┐
│ Amina Studio        LIVE │  │ Atelier Kente      LIVE │
│ amina.latiforge.com      │  │ atelier.latiforge.com   │
│                          │  │                          │
│ 88  credits left         │  │ 0   credits left         │
│ v0.9.99 · 3 landing files│  │ v0.9.99 · no landing yet │
│ ▸ manage                 │  │ ▸ manage                 │
└──────────────────────────┘  └──────────────────────────┘
```

Tile rules:

- The tile is a **button** (`pf.tile`), 10px radius, `t.surface` fill,
  1px `t.line` border, hairline-separated grid (`pf.tileGrid`,
  `auto-fit minmax(240px, 1fr)`), left-aligned text.
- Three lines only: **name + status chip** (line 1), **the URL in mono**
  (`pf.code`, truncated, line 2), **one number + one fact** (line 3:
  `88 credits left` / `v0.9.99 · 3 landing files`). The owner must be able
  to scan ten shops in one screen.
- The fourth line is a `manage` affordance that appears on hover/focus
  (`pf.tileFoot`, lime, 11px, uppercase). The whole tile is clickable.
- Status chips reuse `pf.chip` / `pf.chipGood` / `pf.chipBad` / `pf.chipAdmin`
  (`live` → good, `failed`/`suspended` → bad, tier → admin). Chips are
  7px-radius labels — never pills.
- Hover: border → `t.primary`, **no lift** (tables and tiles do not lift —
  [shipit skill](https://github.com/shipiit/shipit-ui-design/blob/main/skills/dashboard-design/SKILL.md)).

### 3.3 The manage panel (the expanded tile)

Clicking a tile expands the manage panel **in place, directly under the
tile row** (the list stays visible; the panel is the tenant's durable
object, not a transient inspection — [Nimbus](https://github.com/nimbus/nimbus/blob/main/DESIGN.md)).
The panel is a two-column split (`pf.split`: 1fr/1fr ≥ 960px, stacked
below), hairline-ruled, and has its own sticky header with the shop name,
the URL (copy), and `Open shop` / `Open studio` as secondary buttons.

```
┌─ Amina Studio ──────────────────────────────────── [Open shop] [Open studio] ─┐
│                                                                            │
│  SHOP                       │  LANDING                                     │
│  Status        LIVE         │  Published  3 files                          │
│  URL   amina.latiforge.com  │  /index.html  /styles.css  /app.js           │
│  Domain not set             │  [ Edit in the Landing tab → ]              │
│  Tier         starter       │                                              │
│  Bundle       v0.9.99       │  CODES                                       │
│  Created      2026-10-02    │  0421  8813  2207      [Mint codes]        │
│  Studio token  deploy_…     │  [Copy all]                                 │
│  ────────────────────────   │                                              │
│  [Attach your domain]       │  VERSION                                     │
│  [Your domain]              │  Current   v0.9.99                          │
│                              │  [ Switch version ▾ ]                       │
│                              │                                              │
└────────────────────────────────────────────────────────────────────────────┘
```

Content and behaviour:

- **Shop block** — status, URL (copy-to-clipboard), custom domain ("not
  set" + the attach form: `pf.field` + `Attach your domain`), tier, bundle,
  created date, studio token (`pf.codeBox`, copyable).
- **Landing block** — the published file list from `GET /api/v1/shop/landing`
  (paths only), plus a link that jumps to `?tab=landing&shop=<id>` with the
  shop preselected. Publishing never happens from this panel (P5).
- **Codes block** — the codes bound to this shop, in a `pf.codeBox` grid,
  each copyable; `Mint codes` opens the count + note form.
- **Version block** — the current bundle and the version picker
  (`GET /api/v1/shop/bundles` → `POST /api/v1/shop/redeploy`). The picker is
  a `pf.field` select; changing it asks for a confirm because it restarts
  the shop's worker.
- **Destructive:** the owner has no delete (deleting a shop is
  admin-only, [SHOP-API.md §1.7b](./SHOP-API.md)) — nothing red here.

### 3.4 The folder upload flow (the landing dist)

This is the owner's most technical flow, so it gets a dedicated tab
(`?tab=landing`), a shop switcher, and a **staging area**, not a bare
`<input type=file>`.

**The API it must drive** (`SHOP-API.md §1.4`): one multipart call per file,
`POST /api/v1/shop/landing/file?path=<path>[&shop_id=<id>]`, with the
path rules `landing_path`: `[A-Za-z0-9.\-_/]`, ≤ 200 chars, no `..`, no
`//`, `/` → `/index.html`, ≤ 5 MB per file. Then one publish call
`POST /api/v1/shop/landing/apply` → `{ok, files, uploaded, url}`.

**The six steps of the flow:**

1. **Pick the shop.** A row of shop chips (`pf.chipBtn`) at the top of the
   tab; the chosen one is highlighted. The publish call is per shop, so this
   must be explicit before anything is staged.
2. **Pick the folder.** A drop zone (`pf.dropzone`, dashed 1px `t.line`
   border, 10px radius, 24px padding) reading
   `Drop your built site folder here — or choose a folder`.
   The `<input type="file" webkitdirectory>` path is used for the picker
   (already proven in `components/admin-bundles.tsx`); a drag of a folder is
   read with `DataTransferItem.webkitGetAsEntry()` and walked recursively
   ([CoreUpload](https://coreupload.com/Learn/FolderUploads)).
   `webkitRelativePath` gives the relative path of every file.
3. **Preflight (before a single byte is uploaded).** A summary card:
   *file count*, *total bytes*, the *tree* of the picked folder
   (`pf.tree`, monospace, indented), and a **rejected list** with a reason
   per file — `path too long (>200)`, `unsupported character`, `.. not
   allowed`, `larger than 5 MB`. Rejected files are never sent to the
   server. If `index.html` is missing, a warning: *your site root needs an
   index.html — the shop root will show the studio instead.*
   This mirrors the pre-flight modal pattern of a folder uploader that
   reports counts, byte totals and grouped skip reasons before uploading
   ([Ovid/ananta folder upload](https://github.com/Ovid/ananta/pull/32)).
4. **Stage and upload.** A staging table, one row per file
   (`pf.fileRow`): the path (mono), the size, the state
   (`queued` / `uploading 43%` / `done` / `failed — <reason>`), and a
   per-row `Remove` / `Retry`.
   * concurrency **3** (browsers cap parallel connections per origin; a
     queue beats a flood — [Filestack](https://blog.filestack.com/bulk-upload-ui-queues-partial-success/));
   * the aggregate bar is weighted **by bytes**, not by file count, so it
     never lies;
   * progress never goes backwards; a failed file freezes at the percent
     where it failed and `Retry` resumes from there
     ([moumenlab staging area](https://lab.moumen.dev/components/file-upload-staging));
   * a failed file does **not** discard the completed ones;
   * each success is one `POST …/landing/file?path=<relative path>`.
5. **Publish (a separate step).** The `Publish landing page` button
   (`b.btnPrimary`) is **disabled until at least one file has uploaded** —
   exactly the current behaviour, but now with a visible reason under the
   button. On click: `POST /api/v1/shop/landing/apply`, then the result
   line: `Published 12 files (3 newly uploaded) — live at
   https://amina.latiforge.com`. Explain in one line why: *publishing
   re-registers the shop's assets; the studio at /app keeps working.*
6. **Verify.** Links to the live root, to `/api/feed` (the feed the landing
   page embeds) and to the studio. The published file list is re-read from
   `GET /api/v1/shop/landing` so the panel shows the truth, not the local
   guess.

**Failure and edge behaviour**

| Case | What the UI does |
|---|---|
| The platform has no `PLATFORM_TOKEN` for the shop | the tab says so and points to the admin |
| The upload call fails for one file | that row goes red with the API's `message`; the rest continue |
| `NO_FILES` on publish | the button stays disabled and the note explains why |
| The owner has several shops | the switcher is mandatory; the publish call carries `shop_id` |
| 5 MB limit | rejected in preflight, not by a failed request |

### 3.5 Owner-console states

- **Loading**: skeleton rows that keep the grid geometry (no spinner
  centred in a blank card) — [shipit skill](https://github.com/shipiit/shipit-ui-design/blob/main/skills/dashboard-design/SKILL.md).
- **Empty (no shop)**: "No shop yet." + "Each shop gets its own address, its
  own landing page and its own try-on credits." + the `Deploy a shop`
  button. Not a blank card.
- **Empty (no landing files)**: "No landing page published." + "Upload your
  built folder, then publish." + the drop zone.
- **Error**: red text (`b.error`) inside the card that failed, never a
  global toast that hides which read failed. The current "one of them
  failing must not hide the other" behaviour in `home.tsx` is kept.
- **Not approved / suspended**: the console shows the state and the reason,
  and hides the deploy form (the server refuses anyway — 403 `NOT_APPROVED`).

---

## 4. The admin console

`https://latiforge.com/admin.html` — the `ADMIN_TOKEN` gate (in memory
only, never persisted), then the console.

### 4.1 Tab map

| Tab | URL | What it shows | **Primary action** | API used |
|---|---|---|---|---|
| **Requests** (default) | `?tab=requests` | pending signups: email, contact, shop name, age; approve mints the one-shot `plat_` token | `Approve` (per row) | `GET /api/v1/admin/users?status=pending`, `POST /api/v1/admin/approve` |
| **Accounts** | `?tab=accounts` | approved + suspended + rejected users, allowance editor | `Save allowance` | `GET /api/v1/admin/users?status=…`, `POST …/allowance`, `…/suspend`, `…/reactivate` |
| **Shops** | `?tab=shops` | every tenant as a small tile → expanded manage panel | `Redeploy` (in the panel) | `GET /api/v1/admin/shops`, `PATCH …/shops/{id}`, `DELETE …/shops/{id}` |
| **Bundles** | `?tab=bundles` | version list, version upload, **per-tenant assignment table**, bulk assign with preview | `Upload a version` | `GET /api/v1/admin/bundles`, `POST …/bundles?version=`, `POST …/shops/{id}/redeploy` |
| **Codes** | `?tab=codes` | platform 4-digit codes: unbound or bound to a shop | `Mint codes` | `GET /api/v1/admin/tokens?status=`, `POST …/tokens/mint`, `POST …/shops/{id}/tokens`, `…/tokens/cancel`, `…/tokens/{code}/delete` |
| **Credits** | `?tab=credits` | pending credit requests (grant queue) + per-shop balances | `Approve request` | `GET /api/v1/admin/credits`, `POST …/credits/approve`, `POST …/credits/reject` |
| **Activity** | `?tab=activity` | the platform audit feed with filters | — | `GET /api/v1/admin/activity` |

The current seven tabs (`pending`, `approved`, `tokens`, `credits`, `shops`,
`bundles`, `activity`) collapse into these seven; the rename is
**Requests / Accounts** (split by status, not by tab) and **Tokens →
Codes** (the word "codes" is what the domain calls them
([SHOP-API.md §1.5](./SHOP-API.md)) and **Credits** now stands alone
(it is a *billing* queue, not a tab hanging off Tokens).

**Global chrome rules**

- The tab strip is one row, wraps on narrow screens, and every tab shows
  its count: `Requests (3)`, `Shops (12)`, `Codes (41)`, `Credits (2)`.
- A **filter bar** (`pf.filterBar`) sits under the tab strip on every list
  tab: a search field (`pf.search`), a status chip-filter row
  (`pf.chipBtn`), and a `Clear filters` link that appears only when a
  filter is active (the Stripe filter-chip pattern:
  [filter controls](https://docs.stripe.com/stripe-apps/patterns/filter-controls)).
- The bulk bar (`pf.bulkBar`) replaces the filter bar **in place** the
  moment a row is selected — no layout shift.
- Filter, search, tab and selection state all live in the URL (P6).
- Saved views are **not** built in v1 (no endpoint for them); instead the
  filter state is bookmarkable, which is 80% of the value and needs no
  backend. Note this in the release notes as a deliberate omission.

### 4.2 The per-tenant tile + manage panel

The admin's shop view is the same shape as the owner's, with more rows:

```
┌────────────────────────────────────┐  ┌────────────────────────────────────┐
│ Amina Studio              LIVE    │  │ Atelier Kente               LIVE   │
│ amina.latiforge.com                │  │ atelier.latiforge.com             │
│ amina@example.com · starter        │  │ owner@example.org · studio         │
│ 88 credits · v0.9.99 · 3 files    │  │ 0 credits · v0.9.99 · 0 files      │
│ ▸ manage                           │  │ ▸ manage                          │
└────────────────────────────────────┘  └────────────────────────────────────┘
```

Tile lines: **name + status chip** / **URL** / **owner · tier** /
**credits · bundle · landing files** / `manage`.

The **manage panel** (expanded in place) has six blocks:

| Block | Content | Actions |
|---|---|---|
| **Settings** | name, tier, status, subdomain, URL, created | `PATCH /api/v1/admin/shops/{id}` — name and tier inline-editable (`pf.num` for tier, a select for status) |
| **Version** | current bundle, shops on that version, last redeploy | the version picker + `Redeploy` (see §4.3) |
| **Codes** | codes bound to this shop | `Mint for this shop` (count + note), cancel, delete |
| **Credits** | granted / used / left for this shop | `Request`/grant (backend follow-up B4) + the shop's credit requests |
| **Domain** | custom hostname + status (`pending`/`active`/`failed`) | copy, open |
| **Landing** | published file paths | link to the owner's landing view (read-only here) |

**Destructive — `Delete shop`** lives in the panel footer only, is
`b.btnDanger`, and opens a confirm box (`pf.confirm`) that says exactly
what goes: the Worker script, the per-shop D1, the custom domains, the
shop's images, its landing files and all its rows — **there is no undo**
([SHOP-API.md §1.7b](./SHOP-API.md)). The operator must type the shop's
name before `Delete` enables. No other delete in the product may be less
careful than this one.

### 4.3 The bundle / version page

Four blocks on `?tab=bundles`.

**Block 1 — the version list.** A dense table (`pf.table`, sticky header,
13px rows):

| Version | Files | Shops on it | Uploaded | Actions |
|---|---|---|---|---|
| `v0.9.99` | 26 | 9 | 2026-10-19 | `Assign to tenants` · `Redeploy all on it` |
| `v0.9.98` | 26 | 3 | 2026-10-12 | `Assign to tenants` · `Redeploy all on it` |

Every version stays in the list — it is the rollback surface (Shopify keeps
the previously published theme in the library; Webflow keeps every backup
and restores from it:
[Atlas](https://intercom.help/helloatlas/en/articles/16913061-how-to-safely-edit-test-and-publish-shopify-themes),
[Webflow backups](https://help.webflow.com/hc/en-us/articles/33961244069395-Save-and-restore-backups)).
Nothing is deleted when a version is superseded.

**Block 2 — upload a version.** The version label field + the folder
picker, with the **same preflight → staging → per-file progress** pattern
as the owner's landing upload (§3.4), because it is the same code path:
`POST /api/v1/admin/bundles?version=<label>` takes every file under the
field name `file`, with the file name carrying its path inside the bundle
([SHOP-API.md §1.7b](./SHOP-API.md)). The preflight must show the bundle's
expected files — `manifest.json`, `shop.mjs`, `shop.wasm`,
`shop-schema.sql`, `assets/…` — and flag a missing `manifest.json` before
the upload, because a bundle without it cannot be deployed
([PLATFORM.md §3.4](./PLATFORM.md)).

**Block 3 — per-tenant assignment.** A table of every tenant with its
current version and a checkbox:

| ☐ | Shop | Owner | Current version | Target |
|---|---|---|---|---|
| ☐ | Amina Studio | amina@example.com | `v0.9.98` | `v0.9.99` ▾ |
| ☑ | Atelier Kente | owner@example.org | `v0.9.99` | `v0.9.99` ▾ |

Selecting rows swaps the filter bar for the **bulk bar**: `2 selected ·
Clear · Assign to v0.9.99`.

**Block 4 — bulk assign with a preview of what changes.** Before anything
is deployed, the operator sees a diff:

```
Assign v0.9.99 to 2 shops

  Atelier Kente      v0.9.99 → v0.9.99   already on it, skipped
  Amina Studio       v0.9.98 → v0.9.99   will redeploy (worker restarted, ~20 s)

  1 shop will change. 1 shop is skipped. 0 shops fail.
  [ Cancel ]  [ Assign v0.9.99 to 1 shop ]
```

This is the "bulk assign with a preview of what changes" pattern the
brief asks for, and it mirrors how Zoho Mail's Plan View lets an admin
change the assigned plan for one user or for a selected set of users
([Zoho Mail admin console](https://www.zoho.com/mail/help/adminconsole/pooled-storage.html))
and Mautic's batch actions, which open a modal to configure the change
before it applies ([Mautic](https://docs.mautic.org/en/4.x/contacts/manage_contacts.html)).
The confirm button carries the **count**, and the blast radius is stated
in words ("worker restarted") — the NN/g rule is that an action applied to
a large set deserves friction proportional to its blast radius.

After the run, one result line per shop (success / failure + the API's
`message`), exactly as the current `redeployAll` does — but now scoped to
the selection.

**Rollback affordance.** The version list keeps every version and the
tenant rows keep their current version, so a rollback is "assign the older
version again". To make that legible, the tenant row shows
`was v0.9.98 until 12 Oct` when the platform knows the previous version —
this needs one new column (`shops.prev_bundle`, backend follow-up **B2**).
Without it, the fallback is the bundle list: the operator picks the older
version and assigns it, which is the same action with one more click.

### 4.4 The codes page

The platform's 4-digit codes are a **billing instrument**, so the page is
a ledger, not a toy.

- **Top**: `Mint codes` (the primary action). The form: count
  (1–100, `pf.num`), an optional note, and an optional **bind to shop**
  (a select of every tenant). Binding at mint time is what makes a code
  unredeemable by anyone else ([SHOP-API.md §1.7b](./SHOP-API.md)).
- **Filter bar**: status (`All` / `Active` / `Used` / `Cancelled`) as chip
  buttons + a search over the code and the note.
- **Table**: `Code` (mono, `pf.code`), `Status` chip, `Shop` (or `—` when
  unbound), `Note`, `Created`, `Redeemed`, and the row actions.
- **Row actions**: `Cancel` (only on an `active` code; the row stays for
  the audit trail) and `Delete` (red, confirmed — the row is gone for
  good). A used code can be cancelled but not resurrected.
- **Minted batch result**: the new codes appear in a `pf.codeBox` strip,
  copyable in one click, with `N codes minted — copy them now` (the codes
  are shown once here and the shop redeems them later).

### 4.5 The credits page

The credits page is the billing queue and the balance sheet.

- **Pending requests** (primary): a table of `shop`, `requested`,
  `reason`, `age`, and two actions per row — `Approve` (lime; grants
  `row.requested` and closes the request in one step, and a second approve
  cannot double-grant because the state check runs before the write) and
  `Reject` (red + a reason field, stored as `admin: <reason>`)
  ([SHOP-API.md §1.6](./SHOP-API.md)).
- **Balances** (secondary): every tenant's `granted / used / left`, with the
  shops that are at or near zero first — an operator should see the shops
  that are about to run out before they ask.
- **Grant directly**: `POST /api/v1/admin/shops/{id}/credits` — a backend
  follow-up (**B4**). Until it exists, the balances table is read-only.

### 4.6 The activity feed

- A table, newest first, 200 rows max (the API caps it), with `Load more`
  when the page is full.
- Columns: `When` (relative, `2 min ago`, with the absolute time in
  `title`), `Actor`, `Action`, `Subject`, `Detail`.
- The filter bar filters by **action** (chip buttons built from the actions
  present: `deploy`, `landing.apply`, `landing.file`, `domain.attach`,
  `token.redeem`, `credits.approve`, `admin.approve`, …) and by a search
  over actor/subject. Webflow's activity log does exactly this and lets
  you filter by location, change type and author
  ([Webflow Site Activity log](https://help.webflow.com/hc/en-us/articles/46651707969043-Site-Activity-log)).
- Each row's action is a link when the subject is a shop: it opens the
  admin's shop panel with that tenant selected (`?tab=shops&shop=<id>`).

---

## 5. Component inventory → kit slots

### 5.1 The rules for this section

- **`u.*` is the shared try-on kit** (`tryon/frontend/src/styles/ui.stylex.ts`).
  **We do not change it** — it also styles the shop. New shared-looking
  primitives therefore go into `pf.*` (`platform/frontend/src/styles/platform.stylex.ts`).
- Every new slot is **self-contained** (StyleX does not merge classes at
  runtime): each class carries its own background, border, radius, font and
  spacing. Never compose two classes that set the same property.
- Colours come from `tokens` only (`t.bg`, `t.surface`, `t.line`, `t.text`,
  `t.muted`, `t.primary`, `t.primaryInk`, `t.primaryHover`, `t.complement`,
  `t.danger`, `t.wa`). Radius literals are `10` (interactive) or `14`
  (cards); nothing is `9999`.
- Interactive elements cap at **10px radius**; chips are 7px.

### 5.2 Existing slots — what each element uses

| Element | Slot(s) | Notes |
|---|---|---|
| Console page shell | `u.page` | max-width 1100; the admin console may use `pf.pageWide` (see §5.3) |
| Page header / title / lead | `u.header`, `u.h1`, `u.lead` | header is flex; the primary action sits on the right |
| Card, headless card, card head/title | `u.card`, `u.cardFlush`, `u.cardHead`, `u.cardTitle` | 14px radius — the kit's own value |
| Hairline separator | `u.hairline` | inside `u.cardFlush` |
| Stat tile / label / value / rule | `u.stat`, `u.statLabel`, `u.statValue`, `u.statRule`, `u.statGrid` | owner + admin KPI rows |
| List rows (title/sub) | `u.rows`, `u.row`, `u.rowMain`, `u.rowTitle`, `u.rowSub` | every list in the consoles |
| Button row / grow / icon button | `u.btnRow`, `u.btnGrow`, `u.btnIcon` | `u.btnGrow` makes a button full-width under 620px |
| Buttons | `b.btn`, `b.btnPrimary`, `b.btnSecondary`, `b.btnDanger`, `b.btnDisabled` | `base.stylex` — the destructive style is red-bordered, red-on-hover |
| Inline note / meta | `u.inlineNote`, `u.meta` | the "published 12 files" line |
| Empty state | `u.empty` | centred, muted, 28px padding |
| Form field / label / number / row | `pf.field`, `pf.label`, `pf.num`, `pf.fieldRow` | 48px field, 10px radius |
| Code / code box | `pf.code`, `pf.codeBox` | monospace, violet |
| Status chips | `pf.chip`, `pf.chipGood`, `pf.chipBad`, `pf.chipAdmin`, `pf.chips` | 7px radius — never a pill |
| Tabs | `pf.tabs`, `pf.tab`, `pf.tabOn` | the console tab strips |
| Token-card login | `components/token-card.tsx` (`u.card` + `pf.field` + `pf.fieldRow`) | unchanged |

### 5.3 NEW slots to add to `styles/platform.stylex.ts`

All names are prefixed `pf.`; all values reference `tokens`; all radii are
≤ 14 (interactive ≤ 10).

**Console chrome**

| Slot | Purpose | Key properties |
|---|---|---|
| `pf.pageWide` | the admin console's wider shell | `maxWidth: 1360`, `marginInline: auto`, `paddingInline: 14/26`, `display: grid`, `gap: 14` |
| `pf.toolbar` | the row under the tab strip (search + filters + count) | `display: flex`, `gap: 10`, `alignItems: center`, `flexWrap: wrap`, `paddingBlock: 4` |
| `pf.search` | the search input in a toolbar | `height: 40`, `width: 100%`, `maxWidth: 320`, `borderRadius: 10`, `backgroundColor: t.bg`, `borderWidth: 1`, `borderColor: t.line`, `color: t.text`, `paddingInline: 12`, `:focus { borderColor: t.primary }` |
| `pf.chipBtn` | a filter chip that is a button (not a pill) | `height: 32`, `paddingInline: 12`, `borderRadius: 10`, `borderWidth: 1`, `borderColor: t.line`, `backgroundColor: t.surface`, `color: t.muted`, `fontSize: 12`, `fontWeight: 700`, `:hover { borderColor: t.primary, color: t.text }` |
| `pf.chipBtnOn` | the chip in its active state | `borderColor: t.primary`, `color: t.primary`, `backgroundColor: t.surface` |
| `pf.bulkBar` | the sticky contextual bulk-action bar | `position: sticky`, `bottom: 12`, `zIndex: 5`, `display: flex`, `gap: 10`, `alignItems: center`, `flexWrap: wrap`, `backgroundColor: t.surface`, `borderWidth: 1`, `borderColor: t.primary`, `borderRadius: 10`, `padding: "10px 12px"` |
| `pf.bulkCount` | the "3 selected" label | `fontSize: 13`, `fontWeight: 700`, `color: t.text` |
| `pf.textLink` | a link that reads as a link, not a button | `color: t.complement`, `fontWeight: 700`, `fontSize: 13`, `textDecoration: none`, `:hover { textDecoration: underline }` |

**Tables**

| Slot | Purpose | Key properties |
|---|---|---|
| `pf.tableWrap` | the scroll container | `overflowX: auto`, `width: 100%` |
| `pf.table` | the dense data table | `width: 100%`, `borderCollapse: collapse`, `fontSize: 13`, `fontFamily: t.fontBody` |
| `pf.th` | a header cell (sticky) | `position: sticky`, `top: 0`, `backgroundColor: t.surface`, `textAlign: left`, `fontSize: 11`, `fontWeight: 700`, `textTransform: uppercase`, `letterSpacing: ".05em"`, `color: t.muted`, `padding: "8px 10px"`, `borderBottomWidth: 1`, `borderBottomColor: t.line`, `whiteSpace: nowrap` |
| `pf.td` | a body cell | `padding: "8px 10px"`, `borderBottomWidth: 1`, `borderBottomColor: t.line`, `verticalAlign: middle` |
| `pf.tdNum` | a numeric cell (right aligned) | `textAlign: right`, `fontVariantNumeric: tabular-nums` |
| `pf.check` | the selection checkbox cell | `width: 36`, `textAlign: center` |
| `pf.sort` | the sortable header button | `background: none`, `borderWidth: 0`, `color: inherit`, `font: inherit`, `cursor: pointer`, `display: inline-flex`, `gap: 6`, `alignItems: center` |

**Tiles and panels**

| Slot | Purpose | Key properties |
|---|---|---|
| `pf.tileGrid` | the small-tile grid | `display: grid`, `gap: 10`, `gridTemplateColumns: repeat(auto-fit, minmax(240px, 1fr))` |
| `pf.tile` | one tile (a button) | `display: grid`, `gap: 6`, `textAlign: left`, `width: 100%`, `backgroundColor: t.surface`, `borderWidth: 1`, `borderColor: t.line`, `borderRadius: 10`, `padding: 12`, `fontFamily: t.fontBody`, `cursor: pointer`, `:hover { borderColor: t.primary }` |
| `pf.tileOn` | the selected/expanded tile | `borderColor: t.primary` |
| `pf.tileFoot` | the "manage" affordance on a tile | `fontSize: 11`, `fontWeight: 700`, `textTransform: uppercase`, `letterSpacing: ".06em"`, `color: t.primary` |
| `pf.panel` | the expanded manage panel | `backgroundColor: t.surface`, `borderWidth: 1`, `borderColor: t.line`, `borderRadius: 10`, `padding: 14`, `display: grid`, `gap: 12` |
| `pf.panelHead` | the panel's sticky header | `display: flex`, `justifyContent: space-between`, `alignItems: center`, `gap: 10`, `flexWrap: wrap`, `position: sticky`, `top: 0`, `backgroundColor: t.surface`, `paddingBottom: 10` |
| `pf.split` | the two-column panel body | `display: grid`, `gap: 14`, `gridTemplateColumns: minmax(0,1fr)`, `@media (min-width: 960px) { gridTemplateColumns: repeat(2, minmax(0,1fr)) }` |
| `pf.kv` | a key/value list inside a panel | `display: grid`, `gap: 8`, `gridTemplateColumns: "auto minmax(0,1fr)"`, `alignItems: baseline`, `fontSize: 13` |
| `pf.kvKey` | the key | `color: t.muted`, `fontSize: 12` |
| `pf.kvVal` | the value | `color: t.text`, `fontWeight: 700`, `wordBreak: break-word` |

**Upload**

| Slot | Purpose | Key properties |
|---|---|---|
| `pf.dropzone` | the folder drop target | `display: grid`, `placeItems: center`, `gap: 6`, `minHeight: 120`, `borderWidth: 1`, `borderStyle: dashed`, `borderColor: t.line`, `borderRadius: 10`, `backgroundColor: t.bg`, `padding: 20`, `textAlign: center`, `color: t.muted` |
| `pf.dropzoneOn` | the drag-over state | `borderColor: t.primary`, `color: t.text` |
| `pf.fileRow` | one staged file row | `display: grid`, `gap: 8`, `paddingBlock: 8`, `borderBottomWidth: 1`, `borderBottomColor: t.line`, `gridTemplateColumns: minmax(0,1fr) auto` |
| `pf.fileState` | the per-file state text | `fontSize: 12`, `fontWeight: 700`, `color: t.muted`, `whiteSpace: nowrap` |
| `pf.fileStateBad` | the failed state | `color: t.danger` |
| `pf.fileStateGood` | the done state | `color: t.primary` |
| `pf.bar` | a progress track | `height: 4`, `borderRadius: 2`, `backgroundColor: t.line`, `overflow: hidden` |
| `pf.barFill` | the progress fill | `height: "100%"`, `backgroundColor: t.primary`, `transitionProperty: width`, `transitionDuration: ".15s"` |
| `pf.barFillBad` | the failed fill | `height: "100%"`, `backgroundColor: t.danger` |
| `pf.tree` | the preflight file tree | `fontFamily: "ui-monospace, monospace"`, `fontSize: 12`, `color: t.muted`, `lineHeight: 1.6`, `whiteSpace: pre` |

**Landing**

| Slot | Purpose | Key properties |
|---|---|---|
| `pf.landing` | the landing page shell | `maxWidth: 920`, `marginInline: auto`, `paddingInline: 20`, `fontFamily: t.fontBody` |
| `pf.section` | one landing section | `paddingBlock: 48`, `borderBottomWidth: 1`, `borderBottomColor: t.line`, `@media (min-width: 900px) { paddingBlock: 72 }` |
| `pf.sectionLast` | the last section (no rule) | same as `pf.section` without the border |
| `pf.eyebrow` | the lime micro-label | `fontSize: 12`, `fontWeight: 700`, `letterSpacing: ".16em"`, `textTransform: uppercase`, `color: t.primary`, `margin: 0` |
| `pf.hero` | the hero grid | `display: grid`, `gap: 24`, `gridTemplateColumns: minmax(0,1fr)`, `@media (min-width: 900px) { gridTemplateColumns: "1.05fr .95fr", alignItems: center }` |
| `pf.heroTitle` | the H1 | `fontFamily: t.fontHead`, `fontWeight: 700`, `fontSize: "clamp(30px, 5.2vw, 54px)"`, `lineHeight: 1.08`, `color: t.text`, `margin: 0` |
| `pf.heroLead` | the sub-headline | `fontSize: 17`, `lineHeight: 1.55`, `color: t.muted`, `maxWidth: "58ch"`, `margin: 0` |
| `pf.iframe` | the live demo frame | `width: 100%`, `aspectRatio: "16 / 10"`, `borderWidth: 1`, `borderColor: t.line`, `borderRadius: 10`, `backgroundColor: t.bg` |
| `pf.landGrid` | the demo catalogue grid | `display: grid`, `gap: 12`, `gridTemplateColumns: repeat(auto-fill, minmax(150px, 1fr))` |
| `pf.landCard` | one product card | `display: grid`, `gap: 6`, `backgroundColor: t.surface`, `borderWidth: 1`, `borderColor: t.line`, `borderRadius: 10`, `padding: 8`, `textDecoration: none` |
| `pf.landImg` | the garment photo | `width: 100%`, `aspectRatio: "1 / 1"`, `objectFit: cover`, `borderRadius: 7`, `backgroundColor: t.bg` |
| `pf.stepNo` | the numbered step marker | `width: 30`, `height: 30`, `display: inline-grid`, `placeItems: center`, `borderWidth: 1`, `borderColor: t.primary`, `borderRadius: 10`, `color: t.primary`, `fontFamily: t.fontHead`, `fontWeight: 700`, `fontSize: 13` |
| `pf.priceCard` | a pricing tier card | `display: grid`, `gap: 10`, `backgroundColor: t.surface`, `borderWidth: 1`, `borderColor: t.line`, `borderRadius: 10`, `padding: 18`, `alignContent: start` |
| `pf.priceCardOn` | the recommended tier | `borderColor: t.primary`, `borderWidth: 2`, `padding: 17` |
| `pf.price` | the price number | `fontFamily: t.fontHead`, `fontWeight: 800`, `fontSize: 32`, `color: t.text` |
| `pf.band` | a callout band (final CTA) | `backgroundColor: t.surface`, `borderWidth: 1`, `borderColor: t.line`, `borderLeftWidth: 3`, `borderLeftColor: t.primary`, `borderRadius: 10`, `padding: 24` |
| `pf.confirm` | a destructive confirm box | `borderWidth: 1`, `borderColor: t.danger`, `borderRadius: 10`, `padding: 14`, `backgroundColor: t.bg`, `display: grid`, `gap: 10` |
| `pf.diff` | the bulk-assign preview list | `fontFamily: "ui-monospace, monospace"`, `fontSize: 12`, `color: t.muted`, `lineHeight: 1.7` |

### 5.4 New components (files), not new styles

| Component | File | What it does |
|---|---|---|
| `Tile` | `components/shared/tile.tsx` | the small tile; `props: {title, status, lines[], onOpen, open}` |
| `TileGrid` | `components/shared/tile-grid.tsx` | the auto-fit grid + the empty state |
| `Panel` | `components/shared/panel.tsx` | the expanded manage panel shell (head + body + close) |
| `Split` | `components/shared/split.tsx` | the two-column body |
| `KV` | `components/shared/kv.tsx` | a key/value list |
| `DataTable` | `components/shared/data-table.tsx` | header + rows + selection + empty + loading skeleton |
| `BulkBar` | `components/shared/bulk-bar.tsx` | the sticky selection bar |
| `FilterBar` | `components/shared/filter-bar.tsx` | search + chip filters + clear |
| `EmptyState` | `components/shared/empty-state.tsx` | title + reason + action (P3) |
| `ConfirmBox` | `components/shared/confirm-box.tsx` | the red confirm, with an optional typed phrase |
| `DropZone` | `components/shared/drop-zone.tsx` | the folder drop target (picker + drag) |
| `UploadQueue` | `components/shared/upload-queue.tsx` | the preflight + staging + per-file progress + retry engine |
| `ProgressBar` | `components/shared/progress-bar.tsx` | the byte-weighted bar |
| `TabStrip` | `components/shared/tab-strip.tsx` | `pf.tabs` + URL state |

---

## 6. Migration plan

### 6.1 What moves out of `home.tsx` and `admin.tsx`

**`pages/home.tsx` (292 lines today)**

| Today | Goes to | New file |
|---|---|---|
| session load / gate (`TokenCard`) | stays in the page shell | `pages/home.tsx` (≤ 120 lines) |
| the account card (email · contact) | the **Settings** tab | `components/owner/settings-tab.tsx` |
| the 4-stat grid (allowance, deployed, left, live) | the **Shops** tab header | `components/owner/shops-tab.tsx` (uses `u.stat*`) |
| `ShopCard` (the 270-line block: domain, landing upload, codes, bundle, links) | the **tile** + the **manage panel** | `components/owner/shop-tile.tsx` + `components/owner/shop-manage.tsx` |
| `ShopList` | the tile grid | `components/owner/shops-tab.tsx` |
| the landing upload (`<input type=file>` + publish) | the **Landing** tab | `components/owner/landing-tab.tsx` + `components/shared/upload-queue.tsx` |
| the credits card (left/granted/used) | the **Credits** tab | `components/owner/credits-tab.tsx` |
| `ActivityFeed` (10 rows, no filters) | the **Activity** tab (all rows + filters) | `components/owner/activity-tab.tsx` |
| the deploy form | the page header's primary action → a panel | `components/owner/deploy-form.tsx` |
| the "Open admin console" button | the console header's overflow | `components/shared/console-header.tsx` |

**`pages/admin.tsx` (309 lines today)**

| Today | Goes to | New file |
|---|---|---|
| the `ADMIN_TOKEN` gate | stays in the page shell | `pages/admin.tsx` (≤ 130 lines) |
| the 7-tab strip + tab state | the shell + `TabStrip` | `components/shared/tab-strip.tsx` |
| `UsersTab` (pending + approved, one component) | split by role | `components/admin/requests-tab.tsx` + `components/admin/accounts-tab.tsx` (one `users-tab.tsx` with a `mode` prop is acceptable) |
| `TokensTab` (`components/token-rows.tsx`) | the **Codes** tab | `components/admin/codes-tab.tsx` |
| `CreditRequests` (inside `admin-shops.tsx`) | the **Credits** tab | `components/admin/credits-tab.tsx` |
| `ShopsTab` (`components/admin-shops.tsx`) | tiles + manage panel | `components/admin/shops-tab.tsx` + `components/admin/shop-manage.tsx` |
| `admin-shop-controls.tsx`, `admin-shop-codes.tsx` | folded into the manage panel's blocks | `components/admin/shop-manage.tsx` (+ `-sections.tsx` if it passes 300 lines) |
| `BundlesTab` (`components/admin-bundles.tsx`) | the version list + upload + the assignment table | `components/admin/bundles-tab.tsx` + `components/admin/bundle-upload.tsx` + `components/admin/assignment-table.tsx` |
| `ActivityTab` | the **Activity** tab with filters | `components/admin/activity-tab.tsx` |

**`components/shop-list.tsx` (355 lines)** is split: `StatTile` and
`ValueRow` move to `components/shared/`; `ShopCard` is deleted in favour of
the tile + panel; `ActivityFeed` becomes the activity tab.

### 6.2 New files (all under `platform/frontend/src/`)

```
pages/landing.tsx              the public page (new)
landing.html                   the shell for it (new; replaces src/landing.html)
components/shared/tile.tsx
components/shared/tile-grid.tsx
components/shared/panel.tsx
components/shared/split.tsx
components/shared/kv.tsx
components/shared/data-table.tsx
components/shared/bulk-bar.tsx
components/shared/filter-bar.tsx
components/shared/empty-state.tsx
components/shared/confirm-box.tsx
components/shared/drop-zone.tsx
components/shared/upload-queue.tsx
components/shared/progress-bar.tsx
components/shared/tab-strip.tsx
components/shared/console-header.tsx
components/landing/hero.tsx
components/landing/feed.tsx
components/landing/sections.tsx
components/landing/pricing.tsx
components/landing/faq.tsx
components/owner/shops-tab.tsx
components/owner/shop-tile.tsx
components/owner/shop-manage.tsx
components/owner/landing-tab.tsx
components/owner/credits-tab.tsx
components/owner/codes-tab.tsx
components/owner/activity-tab.tsx
components/owner/settings-tab.tsx
components/owner/deploy-form.tsx
components/admin/requests-tab.tsx
components/admin/accounts-tab.tsx
components/admin/shops-tab.tsx
components/admin/shop-manage.tsx
components/admin/bundles-tab.tsx
components/admin/bundle-upload.tsx
components/admin/assignment-table.tsx
components/admin/codes-tab.tsx
components/admin/credits-tab.tsx
components/admin/activity-tab.tsx
demo.ts                        the pinned demo-shop URLs
assets/demo-feed.json          the committed feed snapshot
```

### 6.3 Order of work

Each phase ends green: `bun run check` (tsc), `bun run build`, and a
Firefox headless probe of the affected pages
(`bun /home/pilser/.cache/ffprobe/fresh-act.mjs <url> <png> "<js>" 1280 1000`,
per [PLAN-UX.md §Verification](./PLAN-UX.md)) with a screenshot and a
`document.body.innerText` dump. No backend change ships with a phase that
does not need it.

| Phase | Deliverable | Acceptance |
|---|---|---|
| **W0** | the new `pf.*` slots in `styles/platform.stylex.ts` + `components/shared/*` primitives | tsc + build green; a scratch page renders every slot; no `u.*` change; the kit's olive law intact (no literal colours, ≤10px on interactive elements) |
| **W1** | **the landing page** — `pages/landing.tsx`, `landing.html`, `demo.ts`, `assets/demo-feed.json`, `build.ts` writes `dist/index.html` from the built shell | the apex renders all ten sections; the demo grid shows real garments from the live feed; with the network blocked it renders the snapshot and says so; the CTA reaches `/signup.html`; the page passes a phone-width check (CTA visible at 390px) |
| **W2** | the owner console shell — `pages/home.tsx` → tab strip + URL state + the six tab shells; each tab renders its empty state | the six tabs are reachable and deep-linkable (`?tab=…`); no data is lost from the old page (account, allowance, stats, shops, credits, activity are all still reachable) |
| **W3** | the owner **Shops** tab — tiles + the manage panel + the deploy form in the header | ten shops are scannable without scrolling past the tile grid; every action that existed in `ShopCard` still exists in the panel (domain, codes, version, open shop/studio/feed) |
| **W4** | the owner **Landing** tab — the drop zone, the preflight, the staging queue, publish | a 20-file folder uploads with per-file progress; one deliberately broken file shows red with a reason and can be retried alone; publish reports `files`/`uploaded` and the live URL; the studio at `/app` still works after publishing |
| **W5** | the owner **Credits / Codes / Activity / Settings** tabs | the credits totals still match the old card; codes can be minted and copied; the activity feed shows all rows with filters |
| **W6** | the admin console shell + **Requests / Accounts** | approving still mints the `plat_` token and shows it once; the allowance editor, suspend and reactivate keep working; the tab counts are correct |
| **W7** | the admin **Shops** tab — tiles + the manage panel + the delete confirm | the delete confirm requires the shop name; the panel's settings/tier/status patch works; the panel shows codes, credits, domain and landing |
| **W8** | the admin **Bundles** tab — version list, upload, assignment table, bulk assign with the preview, per-shop result lines | selecting two shops and assigning a version shows the diff first; the confirm carries the count; a failed shop shows its API message and the others still complete |
| **W9** | the admin **Codes / Credits / Activity** tabs | minting bound and unbound codes; cancelling vs deleting behaves as documented; a credit request can be approved once and not twice; the activity feed filters by action |
| **W10** | polish — focus restoration on close, keyboard order, `prefers-reduced-motion`, the `pf.*` audit (no literal colours, no radius > 10 on interactive elements), the empty-state pass | the full audit passes; the Firefox probes of all three surfaces are clean |

### 6.4 Backend follow-ups (not required for W1–W3)

| # | What | Why | Blocking |
|---|---|---|---|
| B1 | `GET /api/v1/public/stats` → `{shops_live, tryons_served, demo_garments}` | the landing's numbers strip (P7). Without it the strip degrades to `—` | W1 (soft) |
| B2 | `shops.prev_bundle` + a `GET /api/v1/admin/shops` field | the "was v0.9.98 until 12 Oct" rollback affordance | W8 (soft) |
| B3 | `POST /api/v1/admin/bundles/assign {bundle_id, shop_ids[]}` → per-shop results | one call, one audit row, instead of the client looping; the loop stays as the fallback | W8 (soft) |
| B4 | `POST /api/v1/admin/shops/{id}/credits {amount, reason}` | the admin's direct grant on the Credits tab (today only requests can be approved) | W9 (soft) |
| B5 | `GET /api/v1/admin/bundles` returns `{version, files, size, uploaded_ms, shops}` instead of a string list | the version table's columns | W8 (hard for the table, soft for the rest) |
| B6 | a platform-side `DEMO_SHOP_URL` surfaced to the frontend at build time | the demo shops' URLs live in one place (`demo.ts`) | W1 (soft — `demo.ts` is enough) |

Everything else in this spec is implemented with the **existing** API —
no backend change is needed for the tab structure, the tiles, the panels,
the assignment table, the codes page or the activity feed.

### 6.5 Do-not-break list

- `api.ts` / `api-admin.ts` are the contract; the console calls them and
  nothing else ([PLAN-UX.md §Rules](./PLAN-UX.md)).
- `u.*` (the shared tryon kit) is **not** modified — it styles the shop.
- The olive law: tokens only, ≤10px on interactive elements, red only for
  destructive.
- `landing.html` stays at `src/landing.html` until W1 lands; the file is
  replaced, not duplicated, and `build.ts` keeps writing `dist/index.html`.
- The one-shot `plat_` token is still shown **exactly once** at approval.
- `DELETE /api/v1/admin/shops/{id}` is still total — the UI must say so and
  must require the typed shop name.
- Every list that shows counts keeps showing counts (`Requests (3)`,
  `Shops (12)`), because an operator's first question is "how many".
- The platform's own `/api/v1/*` surface never gains a browser-facing
  secret; the landing page only ever reads the public demo feed.

---

## 7. Sources

**Admin console patterns**
- <https://docs.stripe.com/stripe-apps/patterns/empty-state> — empty-state
  anatomy, loading → error → empty → content
- <https://docs.stripe.com/stripe-apps/patterns/filter-controls> — filter
  chips, clear filters
- <https://docs.stripe.com/stripe-apps/patterns> — list/filter/action patterns
- <https://www.nyumbazetu.com/docs/getting-started/navigating-the-app> —
  page chrome, one primary action, detail drawers, chips, URL state
- <https://artofstyleframe.com/blog/admin-panel-layouts-saas-dashboard/> —
  bulk-action scope, undo vs confirm
- <https://github.com/shipiit/shipit-ui-design/blob/main/skills/dashboard-design/SKILL.md> —
  shell choice, table defaults, drawer vs modal vs inline edit, bulk bar
- <https://github.com/nimbus/nimbus/blob/main/DESIGN.md> — operator console
  IA, detail page vs drawer vs modal, tables, URL-as-state
- <https://visor.design/docs/blocks/admin-list-page> — list page anatomy,
  sticky bulk bar
- <https://www.saasui.design/blog/saas-filtering-sorting-ux-patterns> —
  filter chips, saved views, empty-results state

**Publish / version / assignment**
- <https://help.shopify.com/en/manual/online-store/themes/canvas/customizing> —
  save vs publish, publish dialog, duplicate-then-publish
- <https://intercom.help/helloatlas/en/articles/16913061-how-to-safely-edit-test-and-publish-shopify-themes> —
  the previous theme stays as a rollback
- <https://help.webflow.com/hc/en-us/articles/46651740529811-Publishing-workflow> —
  pre-publish summary, staging → production
- <https://help.webflow.com/hc/en-us/articles/33961244069395-Save-and-restore-backups> —
  restore points, preview a backup before restoring
- <https://help.webflow.com/hc/en-us/articles/46651707969043-Site-Activity-log> —
  the activity log and its filters
- <https://www.zoho.com/mail/help/adminconsole/pooled-storage.html> — Plan
  View: change one user's plan, or a selected set
- <https://docs.mautic.org/en/4.x/contacts/manage_contacts.html> — batch
  actions with a configuration modal

**Landing pages and try-on**
- <https://www.inbuild.io/guides/saas-landing-page> — the canonical
  skeleton, the hero, three pricing tiers, no fake logos
- <https://www.saashero.net/content/effective-saas-landing-page-structure/> —
  the ten sections, headline as the biggest lever
- <https://reverbico.com/blog/saas-website-examples/> — real UI over stock
  illustrations, CTA labels that name the next step
- <https://www.flow-agency.com/blog/b2b-saas-landing-page-best-practices/> —
  the 4C section framework
- <https://userpilot.com/blog/saas-landing-pages/> — interactive demos,
  2× engagement
- <https://antla.io/blog/virtual-try-on-software-cost> — the 2026 try-on
  price table (entry tier ≈ $20, overage $0.06–0.17)
- <https://tryonvirtual.com/blog/virtual-try-on-pricing> — how try-on is
  packaged (subscription + metered generations)
- <https://www.threekit.com/pricing> — enterprise packaging (quote-only)
- <https://drapelive.com/> , <https://www.zavemi.com/try-on> ,
  <https://www.previewai.app/> , <https://figur.fit/shopify> ,
  <https://dressie.ai/eng> , <https://1match.app/> , <https://realitytry.com/> —
  the real try-on landing pages: the numbers they publish, the ROI
  arithmetic they show, the live demo they embed

**Folder upload**
- <https://coreupload.com/Learn/FolderUploads> — `webkitRelativePath`,
  `webkitGetAsEntry()`, path sanitising
- <https://coreupload.com/Demos/FolderUpload> — preserving relative paths
  end to end
- <https://blog.filestack.com/bulk-upload-ui-queues-partial-success/> — the
  queue, per-file state, byte-weighted progress, scoped retry
- <https://docs.uploadkit.dev/docs/sdk/react/upload-dropzone> — dropzone
  states
- <https://lab.moumen.dev/components/file-upload-staging> — per-file state
  machines, retry that resumes
- <https://github.com/Ovid/ananta/pull/32> — preflight (counts, bytes,
  grouped skip reasons) then a per-file summary
- <https://docs.netlify.com/start/quickstarts/netlify-drop-quickstart/> —
  drop a folder, publish in seconds
