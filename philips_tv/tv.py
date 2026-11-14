"""High-level JointSpace v6 endpoint wrappers."""
import base64
import subprocess
from typing import Any

from .transport import Credentials, JointSpaceTransport

# Shared key baked into Philips firmware; used for AES-CBC fields in /6/system
# (source: ha-philipsjs; the same constant works on Saphi builds).
AUTH_SHARED_KEY = base64.b64decode(
    "ZmVay1EQVFOaZhwQ4Kv81ypLAZNczV9sG4KkseXWn1NEk6cXmPKO/MCa9sryslvLCFMnNe4Z4CPXzToowvhHvA=="
)


def cbc_decode(key: bytes, data: str) -> str:
    """Decode the *_encrypted fields in /6/system (AES-128-CBC, IV prepended).

    Uses the openssl CLI so the package keeps zero required dependencies.
    """
    if not data:
        return ""
    raw = base64.b64decode(data)
    proc = subprocess.run(
        ["openssl", "enc", "-d", "-aes-128-cbc", "-K", key[:16].hex(), "-iv", raw[:16].hex()],
        input=raw[16:], capture_output=True, check=True)
    return proc.stdout.decode()


class PhilipsTV:
    """Friendly wrapper over the endpoints confirmed working on Saphi builds."""

    def __init__(self, host: str, credentials: Credentials, port: int = 1926):
        self.transport = JointSpaceTransport(host, port)
        self.transport.credentials = credentials

    # -- system ----------------------------------------------------

    def system(self, decrypt: bool = True) -> dict:
        resp = self.transport.get("/6/system")
        data = resp.json() or {}
        for field in ("serialnumber", "softwareversion", "model", "deviceid"):
            enc = data.pop(field + "_encrypted", None)
            data[field] = ""
            if enc and decrypt:
                try:
                    data[field] = cbc_decode(AUTH_SHARED_KEY, enc)
                except Exception as exc:  # noqa: BLE001 - show, don't crash
                    data[field] = f"<decode failed: {exc}>"
        return data

    def context(self) -> dict:
        resp = self.transport.get("/6/context")
        return resp.json() or {}

    # -- audio -----------------------------------------------------

    def volume(self) -> dict:
        resp = self.transport.get("/6/audio/volume")
        return resp.json() or {}

    def set_volume(self, level: int, muted: bool = False) -> bool:
        resp = self.transport.post("/6/audio/volume", {"current": int(level), "muted": muted})
        return resp.status == 200

    def set_muted(self, muted: bool) -> bool:
        cur = self.volume()
        return self.set_volume(cur.get("current", 0), muted)

    # -- remote keys -----------------------------------------------

    def send_key(self, key: str) -> bool:
        resp = self.transport.post("/6/input/key", {"key": key})
        return resp.status == 200

    # -- probe -----------------------------------------------------

    def probe_endpoints(self) -> dict:
        """GET known endpoints, return path -> HTTP status."""
        known = [
            "/6/system", "/6/context", "/6/audio/volume",
            "/6/ambilight/currentconfiguration", "/6/ambilight/topology",
            "/6/sources", "/6/applications", "/6/channels", "/6/timer",
            "/6/powerstate", "/6/input/key",
        ]
        out = {}
        for path in known:
            try:
                resp = self.transport.get(path)
                out[path] = resp.status
            except Exception as exc:  # noqa: BLE001
                out[path] = f"error: {exc}"
        return out
