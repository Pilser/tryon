#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
# Release-only rule: this repo NEVER builds binaries locally.
# CI does that (release.yml). For dev we use wrangler dev instead.
npm -g ls 2>/dev/null | grep -q wrangler || true
cd "$ROOT"
if ! command -v wrangler >/dev/null 2>&1; then
  echo "wrangler not installed. Install via: npm i -g wrangler  (no cargo needed)"
  exit 1
fi
echo "[dev-all] starting worker (wrangler dev) on :8787"
wrangler dev --port 8787 &
WPID=$!
sleep 4
echo "[dev-all] starting frontend (bun) on :8811"
cd "$ROOT/frontend"
bun run dev &
FPID=$!
trap "kill $WPID $FPID 2>/dev/null" EXIT
wait
