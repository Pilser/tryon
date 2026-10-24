#!/usr/bin/env bash
# scripts/upload-bundle.sh - upload a built shop bundle to R2 (the manual
# path of Deploy.md §3, made reliable).
#
#   Usage: ./scripts/upload-bundle.sh <bundle_id> [bundle_dir]
#     bundle_id    e.g. v0.9.78 (the R2 key becomes bundles/<id>/…)
#     bundle_dir   where the unpacked bundle lives (default: bundle-out/)
#
# The Cloudflare REST API has no R2 object endpoint, so the manual upload
# uses wrangler (`bunx wrangler@4 r2 object put … --remote`). Each object
# is written, then read back with `r2 object get --remote` to confirm it
# landed (uploads are idempotent and cheap; the token budget is 1200
# req/5min and a bundle is ~60 objects). A put that fails the verify is
# retried up to 8 times before the script exits non-zero.
#
# Requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in the repo-root
# .env (loaded here) — the same creds the platform deploy uses.
set -euo pipefail

cd "$(dirname "$0")/.."          # repo root

BUNDLE_ID="${1:-}"
BUNDLE_DIR="${2:-bundle-out}"
if [ -z "$BUNDLE_ID" ]; then
  echo "usage: $0 <bundle_id> [bundle_dir]" >&2
  exit 2
fi
if [ ! -d "$BUNDLE_DIR/assets" ] || [ ! -f "$BUNDLE_DIR/manifest.json" ]; then
  echo "error: $BUNDLE_DIR does not look like a bundle (missing assets/ or manifest.json)" >&2
  exit 2
fi

set -a; . ./.env; set +a
export CLOUDFLARE_ACCOUNT_ID
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "error: CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID missing from .env" >&2
  exit 2
fi

PREFIX="tryon-bundles/bundles/$BUNDLE_ID"

putone() {
  local rel="$1" tries=0 ok=0
  while [ "$tries" -lt 8 ]; do
    tries=$((tries + 1))
    if bunx wrangler@4 r2 object put "$PREFIX/$rel" --file "$rel" --remote -y >/dev/null 2>&1 \
       && bunx wrangler@4 r2 object get "$PREFIX/$rel" --file /tmp/opencode/bundle-verify.bin --remote >/dev/null 2>&1; then
      echo "ok  $rel"
      return 0
    fi
    sleep 2
  done
  echo "FAIL $rel" >&2
  return 1
}

fail=0
# The four root files.
for f in manifest.json shop.wasm worker.js shop-schema.sql; do
  if [ -f "$BUNDLE_DIR/$f" ]; then
    ( cd "$BUNDLE_DIR" && putone "$f" ) || fail=$((fail + 1))
  else
    echo "skip $f (absent)" >&2
  fi
done

# Every asset file, path mirrored under assets/.
while IFS= read -r f; do
  [ -n "$f" ] || continue
  ( cd "$BUNDLE_DIR" && putone "assets/$f" ) || fail=$((fail + 1))
done < <(cd "$BUNDLE_DIR" && find assets -type f | sed 's|^assets/||')

echo "bundle $BUNDLE_ID upload done (failures=$fail)"
[ "$fail" -eq 0 ]
