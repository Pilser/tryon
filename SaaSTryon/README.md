# SaaSTryon — the platform half

The control plane of Latiforge: it signs the shop owners up, approves
them, deploys each approved owner's shop as its own Worker (its own
subdomain, optionally its own domain), meters the try-on credits and
keeps the console.

**The repository index (folders, files, workflows, the runtime picture)
is the root [`README.md`](../README.md).**

```
SaaSTryon/
├── docs/        the platform documentation
│   ├── PLATFORM.md   architecture, decisions, live findings (§10 = the traps)
│   ├── SHOP-API.md   every endpoint of both halves, with examples
│   ├── Deploy.md     how a release is shipped (CI → artifact → API deploy)
│   ├── DESIGN.md     the research-backed UX spec for the console + landing
│   └── PLAN-UX.md    the UX plan the spec came from
└── platform/
    ├── migrations/    the platform D1 schema, one file per revision
    ├── src/           the platform worker (Rust → Wasm)
    │   ├── http.rs    the router: every /api/v1 path
    │   ├── auth.rs    signup, login, sessions, the owner's account
    │   ├── admin.rs   the admin queue: approve, allowance, suspend
    │   ├── manage.rs  the control plane: bundles, redeploy, studio tokens
    │   └── deployer/  the deployer: the Cloudflare API, the bundle format
    └── frontend/      the platform console (React + StyleX)
        ├── src/pages/     admin, home (owner), landing (public), login, signup
        ├── src/components/admin/ owner/ landing/ shared/
        ├── src/assets/tryon/  the baked photos + the hero video (the manifest)
        ├── src/kit.ts     the design kit (u.*, pf.*, ld.* slots)
        └── src/api.ts     the ONE fetch boundary of this frontend
```

The *other* half of the repo (the shop worker, the storefront, the
shared crate) lives at the root: `worker/`, `frontend/`, `shared/`,
`imgpipe/`.
