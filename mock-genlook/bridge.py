#!/usr/bin/env python3
"""Worker-API front for mock-genlook: credits-free try-on with today's build.

Why this exists: the worker's Genlook base URL is baked into the pre-released
WASM in `.local-rig/glue-node/`. Until CI ships a build that honours
`GENLOOK_BASE` (worker/src/lib.rs), the local worker still calls the real
api.genlook.app. This bridge sits between the frontend and the harness and
implements the three try-on endpoints itself, translating the shop's shape
into the Genlook contract against mock-genlook:

    POST /api/person-upload     -> POST {genlook}/images/upload   (bytes pass through)
    POST /api/try-on[/sync]     -> POST {genlook}/try-on/sync     (body translated)
    GET  /api/generations/<id>  -> GET  {genlook}/generations/<id>

Every other `/api/*` request (products, categories, shop, owner, uploads) is
proxied verbatim to the harness, so the shop looks exactly as it does today.

Point the dev server at the bridge instead of the harness:

    python3 mock-genlook/server.py --delay 2                 # :8899 (Genlook stand-in)
    bun .local-rig/harness.cjs                               # :8787 (real worker)
    python3 mock-genlook/bridge.py                           # :8888 (this)
    cd frontend && API_UPSTREAM=http://127.0.0.1:8888 bun dev.ts

When CI ships the `GENLOOK_BASE`-aware worker, drop the bridge and start the
harness with `GENLOOK_BASE=http://127.0.0.1:8899/tryon/v1` instead.

Stdlib only.
"""

import argparse
import json
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ARGS = None

# Requests the bridge answers itself, keyed by path prefix.
TRYON_OWNED = ("/api/person-upload", "/api/try-on", "/api/generations/")


def _json_or_empty(raw: bytes):
    try:
        return json.loads(raw.decode() or "{}")
    except (ValueError, UnicodeDecodeError):
        return None


def _upstream_post(url: str, body: bytes, content_type: str):
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", content_type)
    req.add_header("x-api-key", ARGS.api_key)
    try:
        with urllib.request.urlopen(req, timeout=ARGS.timeout) as r:
            return r.status, r.read(), r.headers.get("Content-Type", "application/json")
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers.get("Content-Type", "application/json")
    except Exception as e:  # noqa: BLE001 - surface as a JSON error to the shop
        return 502, json.dumps({"message": f"bridge: {e}", "status": 502}).encode(), "application/json"


def _upstream_get(url: str):
    req = urllib.request.Request(url, method="GET")
    req.add_header("x-api-key", ARGS.api_key)
    try:
        with urllib.request.urlopen(req, timeout=ARGS.timeout) as r:
            return r.status, r.read(), r.headers.get("Content-Type", "application/json")
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers.get("Content-Type", "application/json")
    except Exception as e:  # noqa: BLE001
        return 502, json.dumps({"message": f"bridge: {e}", "status": 502}).encode(), "application/json"


def shop_to_genlook(sync_in: dict) -> dict:
    """Mirror worker/src/routes/tryon.rs::build_sync_body exactly."""
    return {
        "products": [{
            "externalId": sync_in.get("product_id", ""),
            "title": sync_in.get("title", ""),
            "description": sync_in.get("description", ""),
            "images": [{"source": {"url": sync_in.get("image_url", "")}}],
        }],
        "person": {"image": {"source": {"id": sync_in.get("person_image_id", "")}}},
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "MockGenlookBridge/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print(f"[bridge] {self.command} {self.path} ->", fmt % args)

    def _read_body(self) -> bytes:
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return b""
        return self.rfile.read(n) if n > 0 else b""

    def _reply(self, status: int, body: bytes, ctype: str = "application/json"):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _proxy(self, method: str, body: bytes):
        url = ARGS.upstream + self.path
        req = urllib.request.Request(url, data=body or None, method=method)
        ct = self.headers.get("Content-Type")
        if ct:
            req.add_header("Content-Type", ct)
        auth = self.headers.get("Authorization")
        if auth:
            req.add_header("Authorization", auth)
        try:
            with urllib.request.urlopen(req, timeout=ARGS.timeout) as r:
                self._reply(r.status, r.read(), r.headers.get("Content-Type", "application/json"))
        except urllib.error.HTTPError as e:
            self._reply(e.code, e.read(), e.headers.get("Content-Type", "application/json"))
        except Exception as e:  # noqa: BLE001
            self._reply(502, json.dumps({"message": f"upstream down: {e}", "status": 502}).encode())

    # ---------- routes ----------
    def do_OPTIONS(self):
        self._reply(200, b"{}")

    def do_GET(self):
        if self.path.startswith("/api/generations/"):
            gid = self.path.rsplit("/", 1)[-1].split("?")[0]
            status, body, ct = _upstream_get(f"{ARGS.genlook}/generations/{gid}")
            self._reply(status, body, ct)
            return
        self._proxy("GET", b"")

    def do_POST(self):
        body = self._read_body()
        if self.path.startswith("/api/person-upload"):
            ct = self.headers.get("Content-Type", "multipart/form-data")
            status, out, rct = _upstream_post(f"{ARGS.genlook}/images/upload", body, ct)
            self._reply(status, out, rct)
            return
        if self.path.startswith("/api/try-on"):
            sync_in = _json_or_empty(body)
            if sync_in is None:
                self._reply(400, json.dumps({"message": "body must be JSON"}).encode())
                return
            payload = json.dumps(shop_to_genlook(sync_in)).encode()
            status, out, rct = _upstream_post(f"{ARGS.genlook}/try-on/sync", payload, "application/json")
            print(f"[bridge]   -> genlook try-on/sync: {status}")
            self._reply(status, out, rct)
            return
        self._proxy("POST", body)


def main():
    global ARGS
    ap = argparse.ArgumentParser(description="Worker-API front for mock-genlook (credits-free local try-on).")
    ap.add_argument("--port", type=int, default=8888)
    ap.add_argument("--upstream", default="http://127.0.0.1:8787", help="harness (everything except try-on)")
    ap.add_argument("--genlook", default="http://127.0.0.1:8899/tryon/v1", help="mock-genlook base")
    ap.add_argument("--api-key", default="test", help="x-api-key sent to the mock (it ignores it)")
    ap.add_argument("--timeout", type=float, default=120.0)
    ARGS = ap.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", ARGS.port), Handler)
    print(f"bridge on http://127.0.0.1:{ARGS.port}/api/* "
          f"(try-on -> {ARGS.genlook}, rest -> {ARGS.upstream})")
    print("run the dev server with:  API_UPSTREAM=http://127.0.0.1:%d bun dev.ts" % ARGS.port)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
