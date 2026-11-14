"""High-level JointSpace v6 endpoint wrappers for TPV-built Philips Saphi TVs."""
import base64
import subprocess
from typing import Any

from .transport import Credentials, JointSpaceTransport

# Shared key baked into Philips firmware; used for AES-CBC fields in /6/system
# (source: ha-philipsjs; the same constant works on Saphi builds).
AUTH_SHARED_KEY = base64.b64decode(
    "ZmVay1EQVFOaZhwQ4Kv81ypLAZNczV9sG4KkseXWn1NEk6cXmPKO/MCa9sryslvLCFMnNe4Z4CPXzToowvhHvA=="
)

# Remote keys accepted by POST /6/input/key on this build (verified 200 for all).
KNOWN_KEYS = [
    "Confirm", "Home", "Back", "Options",
    # Titan OS home screen navigates with Cursor* names (Arrow* is ignored there)
    "CursorUp", "CursorDown", "CursorLeft", "CursorRight",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "VolumeUp", "VolumeDown", "Mute", "PlayPause", "Stop", "FastForward", "Rewind",
    "Next", "Previous", "Dot", "Info", "Source",
    # channel keys verified: ChannelStepUp/Down change channel; 'List' opens the channel list
    "ChannelStepUp", "ChannelStepDown", "List",
    "Teletext", "Subtitle", "Find", "Adjust",
    "RedColour", "GreenColour", "YellowColour", "BlueColour",
    "Digit0", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9",
    # Standby also works but powers the TV off - deliberately excluded from the default list
]


def cbc_decode(key: bytes, data: str) -> str:
    """Decode the *_encrypted fields in /6/system (AES-128-CBC, IV prepended) via openssl CLI."""
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
                except Exception as exc:  # noqa: BLE001
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

    # -- pointer (vestigial on non-touchpad models: accepted, never rendered) --

    def pointer(self) -> dict:
        resp = self.transport.get("/6/input/pointer")
        return resp.json() or {}

    def pointer_move(self, x=None, y=None, xdelta=None, ydelta=None) -> bool:
        """Move the on-screen pointer. x/y = absolute pixels (or 0-1 fractional
        if given as floats), xdelta/ydelta = relative glide."""
        body = {}
        if x is not None: body["x"] = x
        if y is not None: body["y"] = y
        if xdelta is not None: body["xdelta"] = xdelta
        if ydelta is not None: body["ydelta"] = ydelta
        resp = self.transport.post("/6/input/pointer", body)
        return resp.status == 200

    # -- remote keys -----------------------------------------------

    def send_key(self, key: str) -> bool:
        resp = self.transport.post("/6/input/key", {"key": key})
        return resp.status == 200

    def standby(self) -> bool:
        """Send the Standby key. Note: this actually powers the TV off."""
        return self.send_key("Standby")

    # -- settings / channels (new discoveries) ---------------------

    def settings_tree(self) -> dict:
        """Full settings-menu node tree (16 leaves: picture + ambilight)."""
        resp = self.transport.get("/6/menuitems/settings/structure")
        return resp.json() or {}

    def channel_lists(self) -> dict:
        """Installed channel lists (allsat/favsat) with versions."""
        resp = self.transport.get("/6/channeldb/tv")
        return resp.json() or {}

    def activities_tv(self) -> dict:
        resp = self.transport.get("/6/activities/tv")
        return resp.json() or {}

    # -- probe -----------------------------------------------------

    def probe_endpoints(self) -> dict:
        """GET known endpoints, return path -> HTTP status."""
        known = [
            "/6/system", "/6/context", "/6/audio/volume",
            "/6/menuitems/settings/structure", "/6/channeldb/tv", "/6/activities/tv",
            "/6/ambilight/currentconfiguration", "/6/ambilight/topology", "/6/ambilight/power",
            "/6/ambilight/supportedstyles",
            "/6/sources", "/6/applications", "/6/channels", "/6/timer",
            "/6/textentry", "/6/pointer", "/6/quickmenu", "/6/favorites",
        ]
        out = {}
        for path in known:
            try:
                resp = self.transport.get(path)
                out[path] = resp.status
            except Exception as exc:  # noqa: BLE001
                out[path] = f"error: {exc}"
        return out
