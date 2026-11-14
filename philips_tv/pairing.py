"""JointSpace v6 pairing flow for TPV-built Philips Saphi TVs.

Protocol notes (reverse-engineered, see README for the full story):

- POST /6/pair/request with a Client block returns an auth_key and makes
  the TV display a 4-digit PIN valid for ~30 seconds.
- POST /6/pair/grant must be sent with HTTP Digest auth where the
  USERNAME IS THE Client.id FROM THE REQUEST (not the Signature, not a
  device UUID - that trips the HA-library assumption) and the PASSWORD
  IS THE auth_key.
- The grant must use the same TLS connection as its own 401 challenge
  (handled by transport.JointSpaceTransport).
- The HA-library body format ({"access":..., "device":...}) is rejected
  with 403 by this firmware; the {"auth": {...}} format below is what it
  accepts.
"""
import random
import string
import time
from typing import Tuple

from .transport import Credentials, JointSpaceTransport

PAIR_REQUEST = "/6/pair/request"
PAIR_GRANT = "/6/pair/grant"


def _random_signature(n: int = 16) -> str:
    return "".join(random.choices(string.ascii_letters + string.digits, k=n))


def pair(transport: JointSpaceTransport, device_name: str = "philips-tv-rea",
         pin_callback=None) -> Credentials:
    """Run the full pairing flow. pin_callback() must return the PIN shown on the TV."""
    client_id = device_name[:24]
    signature = _random_signature()
    body = {
        "auth": {
            "Signature": signature,
            "Client": {
                "id": client_id,
                "DeviceDisplayName": device_name,
                "DeviceType": "HtmlApp",
                "AppId": "app.control",
            },
        }
    }
    resp = transport.post(PAIR_REQUEST, body)
    data = resp.json()
    if resp.status != 200 or not data or data.get("error_id") != "SUCCESS":
        raise RuntimeError(f"pair/request failed: HTTP {resp.status} {resp.body[:200]}")

    auth_key = data["auth_key"]
    if pin_callback is None:
        pin = input(f"Enter the 4-digit PIN shown on the TV ({data.get('timeout', 30)}s): ").strip()
    else:
        pin = pin_callback()
    pin = "".join(ch for ch in pin if ch.isdigit())[:4]
    if len(pin) != 4:
        raise ValueError("PIN must be 4 digits")

    grant_body = {
        "auth": {
            "auth_key": auth_key,
            "timestamp": int(data["timestamp"]),
            "timeout": int(data.get("timeout", 30)),
            "PIN": pin,
        }
    }
    transport.credentials = Credentials(user=client_id, password=auth_key)
    resp = transport._request(PAIR_GRANT, "POST", grant_body, single_connection=True)
    if resp.status != 200:
        transport.credentials = None
        raise RuntimeError(f"pair/grant failed: HTTP {resp.status} {resp.body[:200]}")
    return Credentials(user=client_id, password=auth_key)
