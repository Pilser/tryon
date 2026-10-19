# SaaSTryon — Platform

This folder is the **platform**: the control plane that signs shop owners up,
approves them, and deploys each approved owner's shop as its own isolated
Worker (their own subdomain, optionally their own custom domain), with a
platform-side proxy for Genlook try-on calls and per-shop token limits.

- Research notes: `docs/PLATFORM.md` (everything discovered about Workers for
  Platforms / Cloudflare for SaaS / Dynamic Workers lives there, with sources).
- Reference implementation cloned read-only into `-example-templates/cf-templates/`
  (the `worker-publisher-template`). Do not edit that folder; it mirrors an
  upstream GitHub repo.

## Planned layout (build order in PLATFORM.md §9)

```
SaaSTryon/
  docs/PLATFORM.md     <- research + decisions (this file's neighbour)
  platform/            <- control-plane Worker: signup, admin approval,
                          deployer (calls the Cloudflare API), token grants
  edge/                <- dispatcher Worker: one wildcard route, routes every
                          hostname (subdomain or custom domain) to the right
                          shop Worker, applies per-tier limits
  outbound/            <- outbound Worker: intercepts shop fetch() to Genlook,
                          injects the API key, enforces per-shop quotas
  tenant-glue/         <- generator for the JS glue module the deployer uploads
  scripts/             <- CI packaging: bundle shop wasm + assets -> R2
  tests/               <- vitest-pool-workers tests per component
  migrations/          <- platform D1 SQL (users, shops, hostnames, tokens)
```
