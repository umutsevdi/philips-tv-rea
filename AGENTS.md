# AGENTS.md

Guide for agents and contributors working on this repo. Two research parts
live here; they use different methods and different docs.

| Part | Method | Docs |
|---|---|---|
| Firmware API (JointSpace, port 1926) | black-box testing against a live TV | this file |
| Home app (app.titanos.tv launcher) | static analysis of its JS bundles | [`home/docs/`](home/docs/) |

If you work on the firmware side, read this file. If you work on the home
app side, start with the numbered docs in [`home/docs/`](home/docs/). The two sides meet in one place: the launcher loads from the
network, so blocking `app.titanos.tv` at DNS level removes the ads (see
[home/docs/05-ads-and-tracking.md](home/docs/05-ads-and-tracking.md)).

# Part 1: Firmware API

## Working on this repo

Python 3.9+, standard library only. `openssl` handles AES decryption. Run
from the checkout, no install step.

Tests are manual against a real TV; there is no mock. Credentials for one
live TV sit in `~/.config/philips-tv-rea/credentials.json`. Never commit
them (`.gitignore` covers `*credentials*`).

Layout:

- `philips_tv/transport.py`: HTTPS, manual digest auth, request gate,
  logging hook (`transport.log_fn`)
- `philips_tv/pairing.py`: pair request/grant
- `philips_tv/discovery.py`: mDNS + SSDP + subnet probe
- `philips_tv/tv.py`: endpoint wrappers, AES decrypt, `KNOWN_KEYS`
- `philips_tv/config.py`: credential storage
- `philips_tv/gui.py`: tkinter console
- `tvctl.py`: CLI entrypoint

Quick workflow:

```bash
python3 tvctl.py status          # liveness check
python3 tvctl.py info            # decrypted identity
python3 tvctl.py key CursorRight # drive the TV
python3 tvctl.py post /6/… '{…}' # raw endpoint exploration
```

The transport gates requests: one in flight, at least 0.7 s apart. Do not
remove this. Bursts crash the TV's API service (see failure modes).

If your change affects the wire protocol, update the protocol section below.
This file is the canonical firmware protocol documentation.

## Pairing protocol

```
client                          TV
  │ POST /6/pair/request          │
  │ {"auth":{"Signature":…,       │
  │  "Client":{"id":…}}}          │
  │ ───────────────────────────▶  │  PIN appears on screen (30 s)
  │ ◀───────────────────────────  │
  │  {auth_key, timestamp}        │
  │                               │
  │  POST /6/pair/grant           │
  │  {"auth":{"auth_key":…,       │
  │   "PIN":"1234"}}              │
  │  + HTTP Digest                │
  │ ───────────────────────────▶  │
  │ ◀───────────── 200 ─────────  │
```

- Digest username: the `Client.id` from pair/request. Not the Signature,
  not a device UUID. The Home Assistant library uses a device UUID here and
  fails on these builds.
- Digest password: the `auth_key` from the pair/response.
- Realm `XTV`, `qop=auth`, MD5.
- The grant retry must reuse the TCP connection that got the 401 challenge
  (`single_connection=True` in transport).
- The HA-library body `{"access":{"scope":…},"device":…}` works only when
  it includes the `featuring` blob from `/6/system`. Without it the TV
  rejects the request with 403.
- Pairing survives reboots; the TV holds multiple pairings.

## Firmware quirks

1. TLS fingerprinting. The TV 403s TLS handshakes it does not recognize.
   Python's default cipher preference fails; `transport.CURL_CIPHERS` makes
   the `ssl` module negotiate like curl. Plain `urllib` and `requests` fail
   with 403 on every endpoint and look like a server problem. Use the
   transport in this repo.

2. Grant needs the same connection. The authenticated retry of
   `POST /6/pair/grant` must go over the connection that received the 401
   challenge. A new connection hangs the daemon until a wall power-cycle.
   Other endpoints need the opposite: challenge on one connection,
   authenticated request on a fresh one. Nonce reuse across connections is
   fine.

3. No challenge for body-less POSTs. The TV answers a POST without a body
   with 503, so `curl --digest` can never POST here. Send the JSON body on
   the first attempt.

4. Request bursts crash the API. About 4 requests per second killed all
   `/6/*` paths until power-cycle. The gate (0.7 s spacing) prevents this.

## Endpoint map

Verified on 40PFS6000/62, API 6.1.0. Legacy plaintext API also answers on
`:1925` without auth.

| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/6/system` | GET | 200 | `*_encrypted` fields: AES-128-CBC, key below |
| `/6/context` | GET | 200 | active input/app |
| `/6/audio/volume` | GET/POST | 200 | `{"current":N,"muted":bool}` |
| `/6/input/key` | POST | 200 | accepts any string; only valid names act |
| `/6/input/pointer` | GET/POST | 200 | accepted, never rendered on non-touchpad models |
| `/6/menuitems/settings/structure` | GET | 200 | settings node tree |
| `/6/menuitems/settings/current` | POST | 503 | needs the TV's settings UI in a specific state |
| `/6/channeldb/tv` | GET | 200 | channel lists + favourites |
| `/6/activities/tv` | GET | 200 | current channel/list |
| `/6/ambilight/*` | GET | 200 | stubs on non-Ambilight models |
| `/6/sources` `/6/applications` `/6/channels` `/6/timer` | GET | 403 | feature-disabled; full pairing scope doesn't unlock |
| `/6/powerstate` | POST | 200 | silently ignored |
| `/6/textentry` `/6/quickmenu` `/6/favorites` | GET | 403 | feature-disabled |

## Key names

`/6/input/key` returns 200 for any string but only acts on valid names.
Names differ by context; this tripped up the Home Assistant library too.

| Context | Works | Doesn't |
|---|---|---|
| Titan home screen | `CursorUp` `CursorDown` `CursorLeft` `CursorRight` | `Arrow*` (ignored there) |
| In-app focus lists | `ArrowUp` `ArrowDown` `ArrowLeft` `ArrowRight` | |
| Channel stepping (live TV) | `ChannelStepUp` `ChannelStepDown` | `ChannelUp`, `ChUp` |
| Channel list | `List` opens it; `GreenColour` toggles favourite | `ChannelList` |
| Colour actions | `RedColour` `GreenColour` `YellowColour` `BlueColour` (context-dependent) | |
| Everywhere | `Home` `Back` `Options` `Confirm` `Info` `Find` `Adjust` `Source` `Teletext` `Subtitle` `Dot` `Digit0-9` `VolumeUp` `VolumeDown` `Mute` `PlayPause` `Stop` `FastForward` `Rewind` `Next` `Previous` `Standby` | |

`Standby` powers the TV off. The `powerstate` POST is accepted but ignored.

## AES decryption

`serialnumber_encrypted`, `softwareversion_encrypted`, `model_encrypted`
in `/6/system` are AES-128-CBC with a hardcoded key shared across Philips
TVs (same constant as ha-philipsjs). Payload: `base64(IV || ciphertext)`,
PKCS7-padded. `tv.py:cbc_decode` runs `openssl enc -d -aes-128-cbc`.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| All endpoints 404 or empty, ping alive | API service crashed | wall power-cycle 30 s; standby is not enough |
| Connection drops mid-request on `/6/*` | authenticated retry on the challenge connection | use a fresh connection (transport handles this) |
| 503 on POST | body-less POST | send the body on the first attempt |
| `CONCURRENT_PAIRING` | previous session still open | wait 40 s |
| 403 on every request from `urllib`/`requests` | TLS fingerprinting | use this repo's transport |
| Grant hangs, all ports die | grant retry on a new connection | same-connection grant |

## Discovery

The TV advertises `_philipstv_s_rpc._tcp.local` (JointSpace, port 1926) and
`_googlecast._tcp.local` (8009) over mDNS in periodic bursts, plus SSDP.
mDNS bursts have quiet periods, so mDNS alone misses the TV. `discovery.py`
runs mDNS, SSDP and a /24 probe in parallel.

# Part 2: Home app (app.titanos.tv)

The launcher is a React SPA served by CloudFront. The firmware opens it
with a per-device auth token in the URL; without the token the CDN serves
a 65 548-byte stub for every asset, so bundles must be fetched with a
spoofed TV user agent and the token's absence limits what you can inspect.

Key findings, all from static analysis (each doc tags its claims as observed,
inferred, or unknown):

- The browser is a Chromium derivative; the firmware injects `window`
  functions (`loadApp`, `getToken`, `getCountry`, ...) that let the SPA
  escape the sandbox.
- Apps come in three tiers: native firmware UI, apps with dedicated bridges
  (Netflix, Prime Video, Freeview), and plain hosted HTML5 pages for most
  of the catalog.
- Ads come from the backend (`eu.app.titanos.tv`) plus SpringServe and
  Equativ VAST tags fetched client-side, with impression and click trackers.
- A second screen pairs over MQTT at `wss://localhost.titanos.local:8083/`,
  a broker running on the TV itself.
- The open question that decides the replacement strategy (easy page swap vs
  DNS override): whether firmware bridges are origin-gated. See doc 09.

## Credits

- [`ha-philipsjs`](https://github.com/danielperna84/ha-philipsjs) (Home
  Assistant): shared AES key and pairing shape.
- [hagezi's DNS blocklists](https://github.com/hagezi/dns-blocklists):
  TV/telemetry lists.
- [jointspace.tv](https://jointspace.tv): remnants of the original
  JointSpace docs.
- [Titan OS developer docs](https://docs.titanos.tv): app hosting model.
