# SaaSTryon — Platform

This folder is the **platform**: the control plane that signs shop owners up,
approves them, and deploys each approved owner's shop as its own isolated
Worker (their own subdomain, optionally their own custom domain), with a
platform-side proxy for Genlook try-on calls and per-shop token limits.

- Research notes: `docs/PLATFORM.md` (Workers for Platforms background, the
  plain-script deploy decision, Cloudflare for SaaS, caching plan — all with
  sources).
- Reference implementation cloned read-only into `-example-templates/cf-templates/`
  (the `worker-publisher-template`). Do not edit that folder; it mirrors an
  upstream GitHub repo.

## Planned layout (build order in PLATFORM.md §9)

```
SaaSTryon/
  docs/PLATFORM.md     <- research + decisions (this file's neighbour)
  platform/            <- control plane (Rust worker `crates/platform/`):
                          signup/login/admin approval, script-PUT deployer
                          (calls the Cloudflare REST API), hostname registrar
                          (custom domains), token/credit grants
  platform/frontend/   <- React + StyleX admin/signup UI (tryon design kit,
                          shared with the shop) -> dist/ served as static
                          assets with edge caching + `_headers` cache tags
  genlook-proxy/       <- small Rust worker (`crates/genlook-proxy/`):
                          shops' Genlook calls via service binding — key
                          injection + per-shop credit metering/rewrites
  tenant-glue/         <- generator for the wasm glue/config the deployer
                          uploads with each shop script
  scripts/             <- CI packaging: bundle shop wasm + assets -> R2
  tests/               <- Rust `ram-test` suites + frontend tsc/vitest
  migrations/          <- platform D1 SQL (users, shops, hostnames, credits)
```

No WfP plan is involved (PLATFORM.md §4.1 D-P1 rev): shops are plain
Workers deployed by the script PUT API; each gets a free `workers.dev`
subdomain plus a custom domain on our zone via the `/workers/domains`
API. Backend Rust is strictly modular (one domain per file, ≤300 lines
target / 500 hard, bloat gate per phase); frontend never calls gateway
internals — only `POST /api/v1/<command>` on the control plane.
