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

- The API refuses it, **for every credential**: with a scoped token
  `PUT /accounts/{id}/workers/subdomain` -> `10036 Account already has an
  associated subdomain`, `POST` -> `10405 Method not allowed for this
  authentication scheme`; with the **global API key** the same two
  answers come back.
- The **dashboard** can: Workers & Pages -> "Change" next to "Your
  subdomain" -> set `latiforge`.
- Safe: Pages projects do not use workers.dev (they are
  `<project>.pages.dev` + their custom domains), and both of our Workers
  have `workers_dev = false`.

## Recovering a Pages project

A scoped token **cannot** read Pages (`10000 Authentication error` on
`GET /accounts/{id}/pages/projects`). The **global API key** can
(`X-Auth-Email` + `X-Auth-Key`):

```bash
# .env (gitignored)
CLOUDFLARE_API_KEY=<global key>      # Dashboard -> My Profile -> API Tokens
CLOUDFLARE_EMAIL=<account email>
CF_AUTH=key                           # scripts/inspect-pages.ts: key|token
```

```bash
set -a; . .env; set +a
bun scripts/inspect-pages.ts jerboa-ui      # projects, deployments, build config, domains
```

**jerboa-ui** (18 deployments, 2026-09-16..18): every deployment is an
**ad-hoc upload** (`deployment_trigger.type = "ad_hoc"`, empty
`commit_hash`) of exactly **3 files** - `index.html`,
`assets/index-<hash>.js`, `assets/index-<hash>.css`. **No `.map` file was
ever uploaded**, so the original sources are not in Cloudflare; the build
output is all that exists (3 of the builds are still served and are
recovered + beautified in the local, gitignored `.local-rig/jerboa/`).
The same is true for **latiforge-campusplan** (4 files, no maps).

`scripts/inspect-pages.ts` prints the projects, their domains, the build
config, the env vars (values hidden) and the deployments with their URLs.
