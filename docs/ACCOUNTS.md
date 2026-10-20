# Cloudflare account layout

What lives in the account `499e8080f5fe32106d9043044fea6f72`
("Latiforge@gmail.com's Account"). Probed 2026-10-20.

## Zone

| Zone | Id | Notes |
|---|---|---|
| `latiforge.com` | `32471b3b5cb0bb23bddd0e7eb9e1f5f1` | the only zone in the account |

## DNS records in `latiforge.com`

| Record | Points at | What |
|---|---|---|
| `latiforge.com` | the platform (custom domain) | SaaSTryon control plane + landing page |
| `amira-boutique-2.latiforge.com` | the shop script (custom domain) | a deployed tenant shop |
| `jerboai.latiforge.com` | CNAME `jerboa-ui.pages.dev` | **Jerboa** tenant portal (Pages project `jerboa-ui`) |
| `campusplan.latiforge.com` | CNAME `latiforge-campusplan.pages.dev` | staff access page (Pages project) |
| `jerboapi.latiforge.com` | A `13.140.191.30` | the Jerboa API - a **VPS**, not Cloudflare |
| `portainer.latiforge.com` | A `13.140.191.30` | Portainer on the same VPS |
| `webmin.latiforge.com` | A `13.140.191.30` | Webmin on the same VPS |

## Workers scripts (Workers only, not Pages)

| Script | Purpose |
|---|---|
| `tryon-platform` | the SaaSTryon control plane (`workers_dev = false`) |
| `shop-<id8>` | deployed tenant shops (`workers_dev = false`) |

The account's **workers.dev subdomain label is `jerboa-ui`** (so a script
would be `<name>.jerboa-ui.workers.dev`). It is unrelated to the Pages
project that happens to have the same name - Pages is served at
`<project>.pages.dev` and via custom domains.

## Renaming the workers.dev subdomain

- The API refuses it: `PUT /accounts/{id}/workers/subdomain` ->
  `10036 Account already has an associated subdomain`.
- The **dashboard** can: Workers & Pages -> "Change" next to "Your
  subdomain" -> set `latiforge`.
- Safe for the Pages projects (they do not use workers.dev) and for our
  Workers (both have `workers_dev = false`).

## Recovering a Pages project

Our API token has **no Pages scope** (`GET /accounts/{id}/pages/projects`
-> `10000 Authentication error`), so the project list and deployment
history need a token with `Pages: Read`.

What is recoverable without the API (plain HTTP against the live site):

```bash
curl -s https://jerboai.latiforge.com/                    # the shell
curl -s https://jerboai.latiforge.com/assets/<file>.js    # the build
```

**Source maps are not published** (the `.map` URL answers with the SPA
fallback HTML), so only the build output can be recovered - the original
sources live in the project repo. A beautified copy of the Jerboa bundle
plus its route inventory sits in the local (gitignored)
`.local-rig/jerboa/`, with notes in `.local-rig/jerboa/README.md`.
