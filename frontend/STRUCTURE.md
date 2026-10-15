# Frontend structure (planned, enforced)

```
frontend/
├── HANDOFF.md            # API contract + owner rules (stable)
├── index.html            # landing shell: mounts only, no logic
├── product.html          # detail shell: mounts only
├── admin.html            # admin shell: mounts only
├── styles/
│   ├── main.css          # ONLY @imports, in load order (no rules here)
│   ├── tokens.css        # palette + type (law)
│   ├── base.css          # reset, body, topbar, buttons, utilities
│   └── components/
│       ├── product-card.css
│       ├── filter-bar.css
│       ├── studio.css
│       ├── timeline.css
│       ├── admin-form.css
│       └── share.css
└── src/
    ├── core/
    │   ├── api.ts        # fetch wrapper + all endpoints (only file that talks HTTP)
    │   ├── format.js     # money, escape, dates (pure, no DOM)
    │   ├── whatsapp.js   # wa.me link builders (pure, no DOM)
    │   └── store.js      # localStorage person + timeline (only file that touches storage)
    ├── components/
    │   ├── product-card.js  # card HTML + swap arming (imports core/api, core/whatsapp)
    │   ├── filters.js       # pills render (imports core/*)
    │   ├── studio.js        # photo flow: pick/validate/upload/sync/poll/download
    │   ├── timeline.js      # strip render + select (imports core/store)
    │   └── admin-form.js    # bundle upload (imports core/api)
    └── pages/
        ├── landing.js    # compose: api + filters + product-card (no new markup)
        ├── product.js    # compose: detail + studio + timeline
        └── admin.js      # compose: admin-form + list
```

## Rules

1. One component per file, ≤200 lines. Pages compose only — no new
   markup, no fetch calls outside `core/api.js`, no localStorage outside
   `core/store.js`.
2. CSS mirrors JS 1:1 (`components/X.js` ↔ `components/X.css`).
   `main.css` holds imports only so load order is explicit.
3. ES modules (`<script type="module">`). No bundler, no framework.
4. Sacred element ids (HANDOFF.md) live in the three HTML shells —
   components must not rename them.
5. Delete, don't duplicate: when a component moves, the old copy goes.
