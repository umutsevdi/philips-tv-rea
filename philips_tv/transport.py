"""HTTP transport for JointSpace v6 on TPV-built Philips Saphi TVs.

Firmware quirks this module works around (details in README):

1. TLS fingerprinting: the TV rejects Python's default handshake with an
   instant 403 on every endpoint. Setting an explicit cipher list makes
   the ssl module negotiate like curl and pass.

2. Pairing grant must be single-connection: POST /6/pair/grant draws a
   401 challenge and the authenticated retry MUST go over the SAME TCP
   connection, otherwise the TV's JointSpace daemon hangs and every port
   stops answering until the TV is power-cycled. General /6/* endpoints
   are NOT affected - they accept the normal two-connection digest flow
   (challenge on one connection, authenticated request on the next,
   reusing the nonce).

3. POST bodies: the TV answers a body-less POST with 503 (never issues a
   challenge for it), which breaks curl's --digest for POSTs. We always
   send the body ourselves, so this does not affect us.
"""
import hashlib
import http.client
import json
import re
import secrets
import ssl
from dataclasses import dataclass
from typing import Any, Optional

# Cipher list tuned so the ssl module negotiates like curl; the TV
# rejects Python's default preference order at the TLS layer.
CURL_CIPHERS = (
    "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:"
    "ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:"
    "ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:"
    "ECDHE-RSA-AES128-SHA:ECDHE-RSA-AES256-SHA:AES128-GCM-SHA256:"
    "AES256-GCM-SHA384:AES128-SHA:AES256-SHA"
)


@dataclass
class Credentials:
    """Digest-auth credentials obtained from pairing."""

    user: str
    password: str


@dataclass
class Response:
    status: int
    headers: dict
    body: str

    def json(self) -> Any:
        if not self.body.strip():
            return None
        try:
            return json.loads(self.body)
        except json.JSONDecodeError:
            return None


class JointSpaceTransport:
    """HTTPS client with manual digest auth tuned for the TV's quirks."""

    def __init__(self, host: str, port: int = 1926, timeout: float = 15.0):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.credentials: Optional[Credentials] = None
        self._ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        self._ctx.check_hostname = False
        self._ctx.verify_mode = ssl.CERT_NONE
        self._ctx.set_ciphers(CURL_CIPHERS)

    # -- public API --------------------------------------------------

    def get(self, path: str) -> Response:
        return self._request(path, "GET")

    def post(self, path: str, body: Any = None) -> Response:
        return self._request(path, "POST", body)

    # -- internals ---------------------------------------------------

    def _request(self, path: str, method: str, body: Any = None,
                 single_connection: bool = False) -> Response:
        """Send a request and follow the digest challenge if one comes back.

        single_connection=True (used for /6/pair/grant) sends the retry on
        the same TCP connection; anything else opens a fresh connection,
        which is what the /6/* endpoints expect.
        """
        payload = json.dumps(body).encode() if body is not None else None
        conn = self._connect()
        try:
            conn.request(method, path, body=payload,
                         headers={"Content-Type": "application/json"} if payload else {})
            resp = conn.getresponse()
            data = resp.read().decode(errors="replace")
            if resp.status != 401 or self.credentials is None:
                return Response(resp.status, dict(resp.getheaders()), data)

            auth = self._digest_header(method, path, resp.getheader("WWW-Authenticate", ""))
            if single_connection:
                conn.request(method, path, body=payload,
                             headers={"Content-Type": "application/json", "Authorization": auth})
                resp = conn.getresponse()
                data = resp.read().decode(errors="replace")
                return Response(resp.status, dict(resp.getheaders()), data)
        finally:
            conn.close()

        if not single_connection:
            conn = self._connect()
            try:
                conn.request(method, path, body=payload,
                             headers={"Content-Type": "application/json", "Authorization": auth})
                resp = conn.getresponse()
                data = resp.read().decode(errors="replace")
                return Response(resp.status, dict(resp.getheaders()), data)
            finally:
                conn.close()
        raise AssertionError("unreachable")

    def _connect(self) -> http.client.HTTPConnection:
        conn = http.client.HTTPConnection(self.host, self.port, timeout=self.timeout)
        conn.connect()
        raw = conn.sock
        conn.sock = self._ctx.wrap_socket(raw, server_hostname=self.host)
        return conn

    def _digest_header(self, method: str, path: str, challenge: str) -> str:
        clean = {}
        for part in challenge.replace("Digest ", "").split(","):
            if "=" in part:
                k, v = part.strip().split("=", 1)
                clean[k.strip()] = v.strip().strip('"')
        realm, nonce = clean["realm"], clean["nonce"]
        qop = clean.get("qop", "auth")
        assert self.credentials is not None
        nc, cnonce = "00000001", secrets.token_hex(8)
        ha1 = hashlib.md5(f"{self.credentials.user}:{realm}:{self.credentials.password}".encode()).hexdigest()
        ha2 = hashlib.md5(f"{method}:{path}".encode()).hexdigest()
        response = hashlib.md5(f"{ha1}:{nonce}:{nc}:{cnonce}:{qop}:{ha2}".encode()).hexdigest()
        return (
            f'Digest username="{self.credentials.user}", realm="{realm}", '
            f'nonce="{nonce}", uri="{path}", response="{response}", '
            f'qop={qop}, nc={nc}, cnonce="{cnonce}"'
        )
