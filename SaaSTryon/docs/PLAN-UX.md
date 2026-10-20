# PLAN-UX (temporary) - the platform dashboards, done properly

Status: in progress. This file is the working plan for the platform UI/UX
(Phase G). It is temporary - it moves into `PLATFORM.md` when the work
lands and gets deleted afterwards.

## What was wrong (found in Firefox, 2026-10-20)

The owner console (`/home.html`) signed in showed:

- the allowance counters, the deploy form ... and **nothing else**
- **no list of the shops the owner deployed** - no URL, no domain, no
  status, no credits
- the "your own domain" and "landing page" cards were **rendered only
  when a deploy had just happened in the same session** (`liveUrl`
  state), so a returning owner never saw them
- the admin console had no **shops** view at all: no shop list, no
  owner, no URL, no token usage, no activity

The backend was mostly there (the deploy, the domain attach, the
landing publish, the credit ledger, the audit rows) - it just was not
**exposed**.

## Backend (done in this change)

| Endpoint | Who | What |
|---|---|---|
| `GET /api/v1/shops` | owner (session) | the owner's shops: url, domain, hostnames, credits (granted/used/left), tokens redeemed, landing files, activity count |
| `GET /api/v1/shops/activity` | owner (session) | the owner's activity feed |
| `GET /api/v1/admin/shops` | admin token | every shop + owner email/name + the same numbers |
| `GET /api/v1/admin/activity` | admin token | the platform activity feed |

New modules: `platform/src/dashboard.rs` (the views),
`platform/src/shops.rs` (the queries: `shops_of_owner`, `all_shops`,
`credit_usage`, `tokens_redeemed`, `hostnames_of`, `activity`).

## UI (the subagents)

### 1. Owner console - `pages/home.tsx` + `components/shop-list.tsx`

- a **"Your shops"** section, always visible (not only after a deploy):
  for each shop: name, **the URL** (clickable), the customer domain
  (or "not set"), the bundle, the deploy date, and the numbers
  (credits left / granted / used, tokens redeemed, landing files)
- per shop the actions the owner can take **right there**:
  attach a domain, upload the landing `dist`, publish it, open the
  shop, open the feed
- the **landing upload** must be visible without deploying first (it
  lives with the shop, not with the deploy form)
- a **credits/balance** card (try-on credits left, plus the request
  button that already exists)
- the existing deploy card stays, but says what it will produce

### 2. Admin console - `pages/admin.tsx` + `components/admin-shops.tsx`

- a **Shops** tab: every shop with owner, URL, domain, credits,
  tokens redeemed, landing state, activity count - searchable
- an **Activity** tab: the audit feed (deploy, domain attach, landing
  publish, token redeem, credits)
- keep the existing tabs (requests / approved / tokens) and add the
  credit-requests view to the Tokens tab (the API exists:
  `GET /api/v1/admin/credits`)

### 3. API docs - `SaaSTryon/docs/SHOP-API.md`

- every endpoint of the platform and of the shop, with auth, body,
  answer and a curl example
- the shop's own API (the deployed shop): `/api/feed`, `/api/products`,
  `/media/<key>`, the studio endpoints
- how a customer wires their landing page to the feed

## Rules for the work

- the platform UI is React + StyleX, the kit is `kit.ts` (`u.*` shared
  slots, `pf.*` platform slots) - no new styling system
- no round buttons, 10px radii, olive theme (`#12140c` bg, `#B9D93C`
  lime, `#8B6FE8` complement, `#ff7a7a` destructive)
- one domain per file, the pages stay under ~300 lines
- `bun run check` (tsc) must pass; `bun run build` must succeed
- do not touch: `api.ts` (the contract is fixed), `platform/src/**`
  (the backend is fixed)

## Verification (not optional)

Firefox headless over the BiDi port:

```bash
bun /home/pilser/.cache/ffprobe/fresh-act.mjs <url> <png> "<js>" 1280 1000
```

Sign in through the UI (the probe starts a fresh context, so the
session has to be typed into the form), then read
`document.body.innerText` and screenshot. Every page must show the
numbers above - no empty states where a list should be.
