#!/usr/bin/env python3
"""Local proxy between the launcher SPA and the TV's JointSpace API.

Why: the TV serves /6/* over HTTPS (port 1926) with a self-signed cert
and digest auth — a page in the TV's browser cannot call it directly.
This stdlib-only server fronts it over plain HTTP, reusing the repo's
transport (cipher fix, digest auth, 0.7 s request gate), and serves the
built launcher so the whole app is same-origin.

Usage:
    python3 titanos/proxy/server.py [--tv 192.168.1.239] [--port 8080]
                                    [--dist ../launcher/dist]

Endpoints for the SPA:
    GET  /api/channels   channel lists from /6/channeldb/tv
    GET  /api/context    active input/app from /6/context
    POST /api/tune       {"channel": N} — digit keys + OK, gated
    everything else      static files from --dist
"""
import argparse
import json
import sys
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from philips_tv.config import load as load_config  # noqa: E402
from philips_tv.transport import Credentials, JointSpaceTransport  # noqa: E402

TV: JointSpaceTransport | None = None
MIN_SPACING = 0.7  # mirrors transport gate; tune sends several keys
_last_tune_key = 0.0


def get_tv():
    global TV
    if TV is None:
        cfg = load_config() or {}
        host = ARGS.tv or cfg.get("host")
        if not host:
            print("No TV configured: pass --tv or pair via tvctl first.", file=sys.stderr)
            raise SystemExit(2)
        TV = JointSpaceTransport(host)
        if cfg.get("user"):
            TV.credentials = Credentials(cfg["user"], cfg["password"])
    return TV


def gate():
    global _last_tune_key
    wait = MIN_SPACING - (time.monotonic() - _last_tune_key)
    if wait > 0:
        time.sleep(wait)
    _last_tune_key = time.monotonic()


def extract_channels(payload: dict) -> list:
    """Flatten /6/channeldb/tv into [{id, name, number, logo, preset}]."""
    out = []
    lists = payload.get("ChannelLists", []) if isinstance(payload, dict) else []
    for lst in lists:
        for i, ch in enumerate(lst.get("Channel", []), start=1):
            out.append({
                "id": ch.get("ccid") or f"{lst.get('List','')}-{i}",
                "name": ch.get("name", ""),
                "number": ch.get("preset") or ch.get("logicalnr") or i,
                "logo": ch.get("logo", ""),
                "preset": ch.get("preset"),
            })
    return out


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ARGS.dist), **kw)

    def log_message(self, fmt, *args):
        print(f"[proxy] {self.address_string()} {fmt % args}")

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    # -- API -----------------------------------------------------------

    def do_GET(self):
        if self.path == "/api/channels":
            try:
                resp = get_tv().get("/6/channeldb/tv")
                data = resp.json()
                self._json(200, extract_channels(data) if data else [])
            except Exception as exc:  # noqa: BLE001
                self._json(502, {"error": str(exc)})
            return
        if self.path == "/api/context":
            try:
                resp = get_tv().get("/6/context")
                self._json(resp.status, resp.json() or {})
            except Exception as exc:  # noqa: BLE001
                self._json(502, {"error": str(exc)})
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/tune":
            self._json(404, {"error": "not found"})
            return
        try:
            n = int(json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0)) or 0))["channel"])
        except Exception:  # noqa: BLE001
            self._json(400, {"error": "body must be {\"channel\": N}"})
            return
        try:
            tv = get_tv()
            for ch in str(n):
                gate()
                tv.post("/6/input/key", {"key": f"Digit{ch}"})
            gate()
            resp = tv.post("/6/input/key", {"key": "Confirm"})
            self._json(200, {"ok": resp.status == 200, "channel": n})
        except Exception as exc:  # noqa: BLE001
            self._json(502, {"error": str(exc)})


ARGS = argparse.Namespace()  # filled in main()


def main():
    global ARGS
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--tv", help="TV IP (default: from tvctl config)")
    p.add_argument("--port", type=int, default=8080)
    p.add_argument("--dist", default=Path(__file__).resolve().parents[1] / "launcher" / "dist",
                   help="launcher build directory to serve")
    ARGS = p.parse_args()
    server = HTTPServer(("0.0.0.0", ARGS.port), Handler)
    print(f"[proxy] serving {ARGS.dist} on http://0.0.0.0:{ARGS.port} (tv via tvctl config or --tv)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
