# philips-tv-rea

Reverse-engineered controller for **TPV-built Philips Saphi TVs** (JointSpace API v6).
Works over the local network, no cloud, no dependencies beyond Python's standard library
(`openssl` binary is used for AES decryption).

Developed against a **Philips 40PFS6000/62** (chassis TPN257E, Saphi Linux, JointSpace 6.1.0).
If your Philips TV runs Saphi (non-Android, made by TPV), this is likely to work.

```
             ┌──────────────────────────────────────────┐
             │  your computer                           │
             │                                          │
   tvctl ────┤  TLS :1926   ──▶  JointSpace daemon      │
   gui  ────┤  (digest auth)    on the TV              │
             └──────────────────────────────────────────┘
```

## Install

```bash
git clone https://github.com/umutsevdi/philips-tv-rea.git
cd philips-tv-rea
python3 tvctl.py --help
```

No `pip install` needed — everything runs from the checkout. `tvctl gui` needs a
desktop; the rest of the CLI is display-free.

## Pair (once)

```bash
python3 tvctl.py pair            # asks for TV IP, then the 4-digit PIN shown on screen
```

Credentials are stored in `~/.config/philips-tv-rea/credentials.json` (mode 0600).
A TV can hold multiple pairings; re-run `pair` any time.

## Use

CLI (for humans *and* agents):

```bash
python3 tvctl.py info            # name, model, serial (decrypted), firmware, api version
python3 tvctl.py status          # volume + current context
python3 tvctl.py probe           # endpoint availability matrix
python3 tvctl.py volume          # read
python3 tvctl.py volume 25       # set
python3 tvctl.py mute            # toggle
python3 tvctl.py key Standby     # any remote key: Home, Back, Confirm, ArrowUp, ...
python3 tvctl.py post /6/audio/volume '{"current":10,"muted":false}'   # raw
```

GUI (for humans):

```bash
python3 tvctl.py gui
```

shows live system info, current context, a volume slider, and a remote pad.
Polls the TV every 2 seconds; buttons fire immediately.

## What works / what doesn't

| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/6/system` | GET | 200 | serial + firmware are AES-CBC-encrypted, decrypted here |
| `/6/context` | GET | 200 | what input/app is active |
| `/6/audio/volume` | GET/POST | 200 | full read + write, mute toggle |
| `/6/input/key` | POST | 200 | full remote control (all keys) |
| `/6/ambilight/*` | GET | 200 | empty on models without Ambilight |
| `/6/sources` | GET | 403 | needs a pairing scope this firmware won't grant |
| `/6/applications` | GET | 403 | same |
| `/6/channels` | GET | 403 | same |
| `/6/timer` | GET | 403 | same |
| `/6/powerstate` | * | 404 | not present on this build at all |

The 403s are a firmware-level scope restriction — the standard HA-library pairing
format (`{"access":{"scope":[...]},"device":{...}}`) is **rejected with 403 by this
build**, so those endpoints are not reachable via the documented API.

---

# Reverse-engineering notes

This section documents everything needed to reproduce the findings, because none of
it is written down anywhere else for Saphi builds (the Home Assistant library covers
Android/MSAF builds and misses every quirk below).

## Discovery

Every Philips TV with the JointSpace API answers on the LAN:

```bash
curl http://<tv-ip>:1925/6/system          # legacy v1 port, no auth
curl -k https://<tv-ip>:1926/6/system      # v6, some fields AES-CBC encrypted
```

The response includes `"os_type": "Linux"` (Saphi) or `"MSAF_..."` (Android),
`pairing_type: "digest_auth_pairing"` and `secured_transport: true`.

The TLS certificate is self-signed, CN `2K22_PHP_LINUX`, issuer `SMTVXTVROOT`,
O `TPV Technology Limited` — TPV is the ODM that actually manufactures these TVs.

## Pairing protocol

```
┌─────────┐    POST /6/pair/request        ┌─────────┐
│ client  │  {"auth":{"Signature":...,"    │   TV    │
│         │   "Client":{"id":...}}}        │         │
│         │ ─────────────────────────────▶ │         │  PIN appears
│         │ ◀───────────────────────────── │         │  on screen (30 s)
│         │  {auth_key, timestamp}         │         │
│         │                                │         │
│         │    POST /6/pair/grant          │         │
│         │  {"auth":{"auth_key":...,      │         │
│         │   "PIN":"1234"}}               │         │
│         │  + HTTP Digest                 │         │
│         │ ─────────────────────────────▶ │         │
│         │ ◀───────────── 200 OK ──────── │         │
└─────────┘                                └─────────┘
```

The grant uses HTTP Digest with:

- **username** = the `Client.id` you sent in pair/request (we use `imza_re` /
  `philips-tv-rea` — *not* the Signature, and *not* a device UUID as the HA
  library assumes)
- **password** = the `auth_key` from the pair/request response
- realm `XTV`, `qop="auth"`, standard MD5 digest

Those same credentials then authenticate every other `/6/*` endpoint.

## The three firmware quirks (the actual research contribution)

### 1. TLS fingerprinting blocks Python's default handshake

`urllib.request` (and anything using Python's default `ssl` cipher preference)
gets an **instant 403 Forbidden** on *every* endpoint — even `pair/request`.
curl against the same URL works fine. Setting an explicit OpenSSL cipher list
(see `transport.CURL_CIPHERS`) makes Python's `ssl` module negotiate like curl
and everything works. The TV is evidently doing JA3-style fingerprinting and
allow-listing known clients — the first time I've seen this on a consumer TV.

### 2. The pairing grant must use a single TCP connection

`POST /6/pair/grant` draws a 401 with a `WWW-Authenticate` challenge. The
authenticated retry **must go over the same TCP connection**. curl's `--digest`
opens a second connection for the retry — and that wedges the TV's JointSpace
daemon so completely that *every port stops answering* until the TV is
power-cycled at the wall. Reproduced every time.

General `/6/*` endpoints are the opposite: they **expect** the challenge on one
connection and the authenticated request on a fresh one (reusing the nonce is
fine). Sending an authenticated request as the *second* request on the same
connection to `/6/*` makes the TV close the socket silently.

`transport.py` therefore has a `single_connection` flag used only for the grant.

### 3. `curl --digest` cannot POST (503)

The TV answers a *body-less* POST with `503 Service Unavailable` — it never
emits a challenge for empty bodies, so curl's two-pass digest dance for POST
methods never completes. Any client that sends the body on the first attempt
(like this library) is unaffected.

## Decrypting `/6/system`

`serialnumber_encrypted`, `softwareversion_encrypted`, `model_encrypted` etc.
are AES-128-CBC with a **hardcoded key shared across all Philips TVs** (also
present in the HA library source):

```
key = base64("ZmVay1EQVFOaZhwQ4Kv81ypLAZNczV9sG4KkseXWn1NEk6cXmPKO/MCa9sryslvLCFMnNe4Z4CPXzToowvhHvA==")
```

Payload layout: `base64(IV || ciphertext)`, PKCS7-padded plaintext.
`tv.py:cbc_decode` shells out to the `openssl` CLI to avoid a dependency.

## Debugging notes (if you hit the same walls)

- When the daemon wedges: **unplug the TV at the wall for ~30 s**. Standby does
  not restart the daemon.
- `CONCURRENT_PAIRING` from `pair/request` means the previous pairing session is
  still live — wait ~40 s for it to expire.
- Requests from Python's `urllib` fail *silently* — always compare with curl
  before assuming the server is broken.
- Authenticated requests to `/6/*` on a reused connection close the socket
  instead of erroring — easy to misread as a network problem.

## Repo layout

```
philips_tv/
  transport.py   HTTPS + manual digest, single-connection support
  pairing.py     pair request/grant flow
  tv.py          endpoint wrappers, AES decryption
  config.py      credential storage (~/.config/philips-tv-rea)
  gui.py         tkinter desktop UI
tvctl.py         CLI entrypoint
```

## Credits / prior art

- [`ha-philipsjs`](https://github.com/danielperna84/ha-philipsjs) (Home Assistant)
  — the shared AES key and the general pairing shape come from here. The Saphi
  quirks above are all places where this firmware *differs* from what HA
  expects.
- Philips JointSpace v6 documentation (community-maintained, mostly dead links,
  but [jointspace.open-source documentation](https://jointspace.tv) still has
  fragments).


## License

MIT — see [LICENSE](LICENSE).

---
Assisted by [imza](https://imza.run).
