# mock-genlook — local stand-in for the Genlook Try-On API

Develop the whole try-on flow with **zero credits, offline-friendly**.
The worker is the only thing that talks to Genlook; point it here:

```bash
# terminal 1: the mock (default 8 s generation time, like production median)
GENLOOK_BASE=http://127.0.0.1:8899/tryon/v1 python3 mock-genlook/server.py

# terminal 2: the harness, with any key (mock ignores it, worker requires one)
GENLOOK_API_KEY=test GENLOOK_BASE=http://127.0.0.1:8899/tryon/v1 bun .local-rig/harness.cjs

# terminal 3: frontend as usual
cd frontend && bun run dev
```

Flags: `--port 8899`, `--delay 8` (seconds PENDING before COMPLETED;
`--delay 1` for fast iteration).

## What it implements (shapes mirror the public docs + the vendored example)

| Endpoint | Behaviour |
|---|---|
| `POST /tryon/v1/images/upload` | multipart `file` → `{"imageId"}` (bytes kept in RAM) |
| `POST /tryon/v1/try-on` | validates, `202 {"generationId","status":"PENDING"}` |
| `POST /tryon/v1/try-on/sync` | waits, `200 {"generationId","status":"COMPLETED","resultImageUrl"}` |
| `GET /tryon/v1/generations/:id` | `PENDING` until delay, then `COMPLETED` + `resultImageUrl` |
| `GET /tryon/v1/products?limit=` | products registered via inline upserts |
| `GET /tryon/v1/account/credits` | fake balance (shape best-effort) |
| `GET /_mock/results/:id.jpg` | the uploaded person bytes back, untouched |

Failure drills (same shapes as production):

- `{externalId}` reference for a never-upserted product → `404 PRODUCT_NOT_FOUND`
  (resend inline, exactly like production asks).
- Title/externalId containing `fail`, or `?fail=yes` → `FAILED` with
  `errorCode`/`errorMessage` after ~2 s.
- `?fail=credits` on try-on → `402 INSUFFICIENT_CREDITS`.
- Unknown ids → `404 IMAGE_NOT_FOUND` / `GENERATION_NOT_FOUND`.
- All errors use `{code, message, status}` + the HTTP status.

## Study notes (vs `_vendor/virtual-try-on-api-example-main`)

- Same contract: sync-first, poll on 202, uppercase `COMPLETED`/`FAILED`,
  temporary `resultImageUrl`, upload-once imageIds, `x-api-key`.
- Their poll loop is `while (true)` with no cap; ours stops after 90 s
  with an error. Ours is safer — keep it.
- Their "mock" is a `title: "mock"` passthrough on the REAL api; this
  mock runs fully local and echoes the person photo, so UI states
  (uploading → processing → before/after → download) are testable free.
- One optimization they have and we don't: send `{externalId}` reference
  first, fall back to inline on `PRODUCT_NOT_FOUND`. Ours always sends
  inline (1 call, always correct, re-analysis every ~15 days). Optional v2.

## Limits

- RAM state only (restart = clean slate). No webhooks, no `/products`
  upsert endpoint, no watermark/retention options — the shop doesn't use them.
- Person photos stay in mock RAM; result URLs only work while it runs.
