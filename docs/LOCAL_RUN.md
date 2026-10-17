# Local run (user / CI-AI agent guide)

## 0. Rules must be observed (see AGENTS.md §1)

- **NEVER run `cargo build`, `cargo run`, `cargo install`, `cargo package`, `cargo publish` locally.**
- **Only** `cargo check --tests`, `cargo test`, `cargo fmt` via `./scripts/ram-check.sh` / `./scripts/ram-test.sh`.
- **ONLY** `/dev/shm` is writable as a build target — `./scripts/ram-check.sh` handles this.
- Release binaries are built only in `release.yml`; artifact must be collected with the GitHub token
  (stored in `~/.git-credentials` via `credential.helper store`, see §4).

## 1. Start the stack (two processes, one command each)

### A) Frontend dev (Bun, no rust)
```bash
cd frontend && bun run dev   # :8811 — proxies /api/* -> :8787
```
- Runtime: `frontend/dev.ts`.
- Serves `frontend/index.html` etc. at `/app/...`
- Watches `src/**/*.{ts,tsx}` and re-builds `dist/` (main.js + lazy chunks) + `dist/stylex.css`
- Serves an offline static fallback if :8787 is down.

### B) Worker API on :8787
For a fully-functional API (products / try-on / studio upload) use the pre-released WASM in `.local-rig`:

```bash
cp /tmp/opencode/worker/tryon_worker.wasm ./.local-rig/tryon_worker.wasm
PORT=8787 bun ./local-rig/harness.cjs   # binds to :8787
```

The harness does not use Rust at runtime; it loads the pre-compiled worker script (`glue-node/tryon_worker.js`) and
routes `GET /api/*`, `POST /api/*`, `GET /uploads/*` and `/app/*` (serving `frontend/pages` static files mostly).
Seed is read/written from `.local-rig/seed.json` (expects 3-image rows: `image_url`, `model_image_url`, `styled_image_url`).

Owner unlock (for Studio/bundle upload) is NOT enforced locally because `admin_token()` returns `""`, so `login_ok`
accepts any token (e.g. `admin123`). Persist now via `core/store.ts → saveOwner(token)`.

## 2. Testing UI without any API

- Just use `http://localhost:8811/app/`.
- `core/api.ts` falls back to `[]` on failure; empty states show on product grid / studio.

## 3. How to get the WASM binary from CI

1. Ensure `git push` has actually reached GitHub (the PAT exists at `~/.git-credentials`).
2. Make a new commit and push a tag (`git tag v0.x && git push origin v0.x`) —
   **never** commit to a branch expecting CI to skip; release.yml requires `push: tags: ["v*"]`.
3. Wait for the workflow to finish (≈ 5-10 min).
4. List artifacts with the token:

   ```bash
   PAT=$(python3 -c 'print(open("/home/pilser/.git-credentials").read().split("://")[1].split("@")[0].split(":")[1])')
   curl -sS -H "Authorization: Bearer $PAT" \
     "https://api.github.com/repos/Pilser/tryon/actions/runs?per_page=5" \
    | python3 -c 'import json,sys; [print(r["id"],r["status"],r["conclusion"]) for r in json.load(sys.stdin)["workflow_runs"]]'
   ```
5. Download the run artifact you just pushed:
   ```bash
   RUN=<run_id>
   ART=$(curl -sS -H "Authorization: Bearer $PAT" \
      "https://api.github.com/repos/Pilser/tryon/actions/runs/$RUN/artifacts" \
      | python3 -c 'import json,sys; [print(a["id"]) for a in json.load(sys.stdin)["artifacts"] if a["name"].startswith("tryon-worker-")]')
   curl -sS -L -H "Authorization: Bearer $PAT" \
     "https://api.github.com/repos/Pilser/tryon/actions/artifacts/$ART/zip" \
     -o /tmp/opencode/worker.zip && unzip -o /tmp/opencode/worker.zip -d /tmp/opencode/worker
   ```

6. Replace the rig binary (zero Rust compilation):
   ```bash
   cp /tmp/opencode/worker/tryon_worker.wasm ./local-rig/tryon_worker.wasm
   ```
   Restart the harness `bun ./local-rig/harness.cjs`; products still seed from `seed.json`.

## 4. High-level file map that matters for local testing

| File | Purpose |
|---|---|
| `frontend/index.html` | landing shell, Studio link |
| `frontend/product.html` | detail + video/res img, studio |
| `frontend/studio.html` | unified studio (visitor + owner) |
| `frontend/dev.ts` | :8811 dev server, `/api/*` proxy to 8787, watchers |
| `frontend/build.ts` | esbuild + stylex compile only |
| `local-rig/harness.cjs` | Bun worker shim (port 8787, API fallback) |
| `local-rig/seed.json` | data source for local grid |
| `scripts/ram-check.sh`, `scripts/ram-test.sh` | `cargo check --tests` / `cargo test` (the only allowed Rust steps) |

## 5. Mobile-specific items already fixed

- Cards responsive `width:100%` with `max-width:340px` under 400 px.
- Studio/detail padding tightened (`12-16px`) via media queries in `card.stylex.ts`, `panels.stylex.ts`, `base.stylex.ts`, `landing.stylex.ts`.
- Bundle stays StyleX compiled and CSS tokens alive.

## 6. Try-on without credits (mock Genlook)

`mock-genlook/server.py` is a stdlib-only stand-in for `https://api.genlook.app/tryon/v1`
that returns the person photo unchanged after a configurable delay. The worker reads
`GENLOOK_BASE` (defaults to production), so the whole flow — upload → try-on →
PENDING → COMPLETED → download — runs free. See `mock-genlook/README.md`.

```bash
python3 mock-genlook/server.py --delay 2                     # :8899
GENLOOK_API_KEY=test GENLOOK_BASE=http://127.0.0.1:8899/tryon/v1 \
  bun .local-rig/harness.cjs                                 # :8787
cd frontend && bun run dev                                   # :8811
```

Failure drills: `?fail=credits` → `402 INSUFFICIENT_CREDITS`; a `title`/`externalId`
containing `fail` → `FAILED`; an unknown `{externalId}` reference → `404 PRODUCT_NOT_FOUND`.