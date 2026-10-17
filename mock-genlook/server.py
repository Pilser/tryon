#!/usr/bin/env python3
"""Mock Genlook Try-On API — local stand-in for https://api.genlook.app/tryon/v1.

Our worker is the only thing that talks to Genlook; point it here to develop
the whole try-on flow without spending credits::

    GENLOOK_BASE=http://127.0.0.1:8899/tryon/v1 python3 server.py --delay 8

Implemented (shapes mirror the public docs):
  POST /tryon/v1/images/upload      multipart file   -> {"imageId": ...}
  POST /tryon/v1/try-on             JSON body        -> 202 {"generationId", "status":"PENDING"}
  POST /tryon/v1/try-on/sync        JSON body        -> 200 {"generationId","status":"COMPLETED","resultImageUrl"}
  GET  /tryon/v1/generations/<id>                    -> PENDING, then COMPLETED + resultImageUrl
  GET  /tryon/v1/products?limit=N                    -> products seen so far via inline upserts
  GET  /tryon/v1/account/credits                     -> fake balance (shape is best-effort)
  GET  /_mock/results/<id>.jpg                      -> the uploaded person bytes back

Behaviours worth studying:
  * Reference-only products ({externalId} without prior inline) fail with
    PRODUCT_NOT_FOUND, exactly like production: resend inline to fix.
  * Any title/externalId containing "fail" yields FAILED (errorCode +
    errorMessage), and INSUFFICIENT_CREDITS can be forced with
    ?fail=credits on the try-on call.
  * resultImageUrl values are temporary-style absolute URLs, like prod.
  * Errors use the stable {code, message, status} shape + HTTP status.

Stdlib only. State lives in RAM (restart = clean slate).
"""

import argparse
import hashlib
import io
import json
import mimetypes
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

IMAGES: dict[str, dict] = {}   # imageId -> {"bytes": b, "mime": str}
GENS: dict[str, dict] = {}      # generationId -> {...}
PRODUCTS: dict[str, dict] = {}  # externalId -> last inline product
_counter = 0
_lock = threading.Lock()
ARGS = None


def _next(prefix: str) -> str:
    global _counter
    with _lock:
        _counter += 1
        n = _counter
    return f"{prefix}_{int(time.time()*1000):x}{n:02x}"


def _send(h: BaseHTTPRequestHandler, status: int, obj=None, raw=None, ctype="application/json"):
    body = raw if raw is not None else json.dumps(obj).encode()
    h.send_response(status)
    h.send_header("Content-Type", ctype)
    h.send_header("Content-Length", str(len(body)))
    # The shop fetches resultImageUrl to build a download blob, so this
    # cross-origin URL needs CORS just like the real signed URLs do.
    h.send_header("Access-Control-Allow-Origin", "*")
    h.send_header("Access-Control-Allow-Headers", "content-type,x-api-key,authorization")
    h.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    h.end_headers()
    h.wfile.write(body)


def _err(h: BaseHTTPRequestHandler, status: int, code: str, message: str):
    _send(h, status, {"code": code, "message": message, "status": status})


def _base(h: BaseHTTPRequestHandler) -> str:
    host = h.headers.get("Host", "127.0.0.1:8899")
    return f"http://{host}"


def _sniff_mime(b: bytes, fallback: str) -> str:
    if b[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return "image/webp"
    if fallback.startswith("image/"):
        return fallback
    return "image/jpeg"


class Handler(BaseHTTPRequestHandler):
    server_version = "MockGenlook/1.0"

    def log_message(self, fmt, *args):
        print(f"[{time.strftime('%H:%M:%S')}] {self.command} {self.path} ->", fmt % args)

    # ---------- helpers ----------
    def _json_body(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        raw = self.rfile.read(n) if n > 0 else b""
        try:
            return json.loads(raw.decode() or "{}")
        except (ValueError, UnicodeDecodeError):
            return None

    def _multipart_file(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return None
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if length <= 0 or length > 12 * 1024 * 1024:
            return None
        raw = self.rfile.read(length)
        # Parse with the email package (cgi was removed in Python 3.13).
        from email.parser import BytesParser
        from email.policy import HTTP
        msg = BytesParser(policy=HTTP).parsebytes(
            b"Content-Type: " + ctype.encode() + b"\r\n\r\n" + raw
        )
        if not msg.is_multipart():
            return None
        for part in msg.iter_parts():
            disp = part.get_content_disposition() or ""
            if disp != "form-data":
                continue
            if part.get_param("name", header="content-disposition") != "file":
                continue
            data = part.get_payload(decode=True) or b""
            if not data:
                return None
            return data, part.get_content_type(), part.get_filename() or "upload.bin"
        return None

    # ---------- routes ----------
    def do_OPTIONS(self):
        _send(self, 200, {})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path, qs = parsed.path, urllib.parse.parse_qs(parsed.query)
        if path == "/tryon/v1/images/upload":
            return self._upload()
        if path == "/tryon/v1/try-on":
            return self._tryon(sync=False, fail=qs.get("fail", [""])[0])
        if path == "/tryon/v1/try-on/sync":
            return self._tryon(sync=True, fail=qs.get("fail", [""])[0])
        return _err(self, 404, "NOT_FOUND", f"no such route: {path}")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path, qs = parsed.path, urllib.parse.parse_qs(parsed.query)
        if path.startswith("/tryon/v1/generations/"):
            return self._generation(path.rsplit("/", 1)[-1])
        if path == "/tryon/v1/products":
            try:
                limit = int(qs.get("limit", ["20"])[0])
            except ValueError:
                limit = 20
            items = list(PRODUCTS.values())[: max(0, limit)]
            return _send(self, 200, {"products": items})
        if path == "/tryon/v1/account/credits":
            return _send(self, 200, {"credits": 9999, "currency": "USD"})
        if path.startswith("/_mock/results/") and path.endswith(".jpg"):
            return self._result(path.rsplit("/", 1)[-1][:-4])
        return _err(self, 404, "NOT_FOUND", f"no such route: {path}")

    # ---------- handlers ----------
    def _upload(self):
        got = self._multipart_file()
        if not got:
            return _err(self, 400, "INVALID_IMAGE", "multipart field 'file' with image bytes required")
        data, mime, _name = got
        if len(data) > 10 * 1024 * 1024:
            return _err(self, 400, "IMAGE_TOO_LARGE", "10 MB max")
        image_id = _next("img")
        IMAGES[image_id] = {"bytes": data, "mime": _sniff_mime(data, mime)}
        print(f"  stored person image {image_id} ({len(data)} bytes)")
        return _send(self, 200, {"imageId": image_id})

    def _products_from(self, body: dict):
        """Validate + register inline products. Returns (ok, error_response)."""
        products = body.get("products")
        if not isinstance(products, list) or not products:
            return False, (400, "INVALID_PRODUCT", "products[0] with title/description/images required")
        if len(products) > 4:
            return False, (400, "TOO_MANY_PRODUCTS", "max 4 products per call")
        for p in products:
            ext = (p.get("externalId") or "").strip()
            if ext:
                if "title" in p:  # inline upsert: (re)register + refresh lifetime
                    PRODUCTS[ext] = {
                        "externalId": ext,
                        "title": p.get("title", ""),
                        "description": p.get("description", ""),
                        "images": p.get("images", []),
                    }
                elif ext not in PRODUCTS:  # reference to an unknown product
                    return False, (404, "PRODUCT_NOT_FOUND",
                                   f"unknown externalId '{ext}': resend it inline once")
            # one-shot (no externalId): accepted, expires in 7 days like prod
        return True, None

    def _person_id(self, body: dict):
        try:
            return body["person"]["image"]["source"]["id"]
        except (KeyError, TypeError):
            return ""

    def _tryon(self, sync: bool, fail: str):
        body = self._json_body()
        if body is None:
            return _err(self, 400, "INVALID_JSON", "body must be JSON")
        ok, err = self._products_from(body)
        if not ok:
            status, code, msg = err
            return _err(self, status, code, msg)
        person = self._person_id(body)
        if not person:
            return _err(self, 400, "INVALID_PERSON", "person.image.source.id required")
        if person not in IMAGES:
            return _err(self, 404, "IMAGE_NOT_FOUND", "unknown person image id: upload it first")
        if fail == "credits":
            return _err(self, 402, "INSUFFICIENT_CREDITS", "Top up the account balance and retry.")
        gid = _next("gen")
        force_fail = fail == "yes" or any(
            "fail" in str(p.get("title", "")).lower() or "fail" in str(p.get("externalId", "")).lower()
            for p in body.get("products", []) if isinstance(p, dict)
        )
        GENS[gid] = {
            "person": person,
            "products": body.get("products", []),
            "created": time.time(),
            "delay": ARGS.delay,
            "force_fail": force_fail,
        }
        if sync:
            time.sleep(min(ARGS.delay, 90))
            return self._finish(gid)
        print(f"  queued {gid} (sync={sync})")
        return _send(self, 202, {"generationId": gid, "status": "PENDING"})

    def _finish(self, gid: str):
        g = GENS.get(gid)
        if not g:
            return _err(self, 404, "GENERATION_NOT_FOUND", f"unknown generation id: {gid}")
        if g["force_fail"]:
            return _send(self, 200, {
                "generationId": gid, "status": "FAILED",
                "errorCode": "MODEL_REFUSED", "errorMessage": "mock forced failure",
            })
        url = f"{_base(self)}/_mock/results/{gid}.jpg"
        return _send(self, 200, {
            "generationId": gid, "status": "COMPLETED", "resultImageUrl": url,
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(g["created"])),
            "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        })

    def _generation(self, gid: str):
        g = GENS.get(gid)
        if not g:
            return _err(self, 404, "GENERATION_NOT_FOUND", f"unknown generation id: {gid}")
        if g["force_fail"] and time.time() - g["created"] >= 2:
            return _send(self, 200, {
                "generationId": gid, "status": "FAILED",
                "errorCode": "MODEL_REFUSED", "errorMessage": "mock forced failure",
            })
        if time.time() - g["created"] < g["delay"]:
            return _send(self, 200, {"generationId": gid, "status": "PENDING"})
        return self._finish(gid)

    def _result(self, gid: str):
        g = GENS.get(gid)
        if not g or g["person"] not in IMAGES:
            return _err(self, 404, "NOT_FOUND", "no such result (yet)")
        rec = IMAGES[g["person"]]
        # Same image back, like requested: the person photo, untouched.
        return _send(self, 200, raw=rec["bytes"], ctype=rec["mime"])


def main():
    global ARGS
    ap = argparse.ArgumentParser(description="Mock Genlook Try-On API (local, no credits).")
    ap.add_argument("--port", type=int, default=8899)
    ap.add_argument("--delay", type=float, default=8,
                    help="seconds until PENDING becomes COMPLETED (prod median ~8s)")
    ARGS = ap.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", ARGS.port), Handler)
    print(f"mock genlook on http://127.0.0.1:{ARGS.port}/tryon/v1 (delay={ARGS.delay}s)")
    print("point the worker at it: GENLOOK_BASE=http://127.0.0.1:8899/tryon/v1 (+ GENLOOK_API_KEY=anything)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
