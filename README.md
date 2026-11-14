# philips-tv-rea

Take control of your **Philips Saphi / Titan OS TV** over the local network —
volume, remote, system info — and **debloat the home screen** by cutting its
cloud connection.

No cloud dependency, no hardcoded addresses, no dependencies beyond Python's
standard library. Developed and verified against a **Philips 40PFS6000/62**
(Saphi, JointSpace API 6.1); any TPV-built Philips TV is likely to work.

```
   your computer                     your TV
┌──────────────────┐   TLS :1926   ┌──────────────────┐
│  tvctl / gui     │ ────────────▶ │  JointSpace API  │
│  activity log    │  digest auth  │  (reverse-eng.)  │
└──────────────────┘               └──────────────────┘
```

## Why

Entry-level Philips TVs (Saphi / Titan OS) ship with a launcher that streams
from the cloud, sponsored content included, and a remote you can't script.
This project fixes both:

- **Full remote control** from your computer — every key, volume, mute.
- **Know your TV** — real serial number, firmware, and settings menu
  structure, decrypted (the TV encrypts them even on your own LAN).
- **Debloat** — the home screen is a cloud web app; block it at the DNS
  level and the sponsored banners disappear (see below).
- **Everything is visible** — the GUI logs every request to the TV with
  timestamps and latency, so nothing happens silently.

## Install

```bash
git clone https://github.com/umutsevdi/philips-tv-rea.git
cd philips-tv-rea
python3 tvctl.py gui
```

That's it. First launch discovers TVs on your network automatically
(SSDP + subnet scan), asks you to confirm a 4-digit PIN shown **on the TV
screen**, and saves the pairing.

Requirements: Python 3.9+, a desktop for the GUI (the CLI works headless),
and the `openssl` command (present on virtually every Linux/macOS).

Your TV must be on the same network. If auto-discovery fails, find the IP in
your router's device list and run `python3 tvctl.py pair --host <IP>`.

## Debloating your TV's home screen

The single most useful discovery in this project: **the home screen of these
TVs is not rendered locally.** It streams from
[`https://app.titanos.tv/`](https://app.titanos.tv/) — a CloudFront-hosted
web app run by Titan OS. Sponsored banners, featured-content tiles, the
"powered by" splash: all loaded from the cloud every time.

That means the ads are not baked into the firmware — they can simply be
blocked:

1. Set up a network-wide DNS blocker ([Pi-hole](https://pi-hole.net/),
   [AdGuard Home](https://github.com/AdguardTeam/AdGuardHome)) or point the
   TV's DNS at one.
2. Block `app.titanos.tv` (Pi-hole: *Domain management → add to blacklist*).
3. Restart the TV's home app (or the TV).

Result: the sponsored content disappears; live TV, HDMI inputs and regular
apps are unaffected. For a stricter setup, [hagezi's DNS
blocklists](https://github.com/hagezi/dns-blocklists) include dedicated TV/telemetry
lists that cover most Philips tracking domains as well.

Pair this with the app: `tvctl key Home` to jump straight to TV, no need to
touch the (now clean) launcher at all.

## Using the GUI

```bash
python3 tvctl.py gui
```

Three columns, everything live:

- **Left** — TV identity (name, model, serial, firmware — decrypted from
  the TV's own encrypted fields), current context, connection state,
  Standby and Reconnect.
- **Center** — volume display and slider, mute, compact remote keypads
  grouped by function (navigation, arrows, media, TV, colour keys, digits).
- **Right** — the activity log: every single request to the TV with
  timestamp, HTTP status, latency and payload size. Amber = request sent,
  green = success, red = error. Nothing happens silently.

## Using the CLI

```bash
python3 tvctl.py info            # name, model, serial (decrypted), firmware, API version
python3 tvctl.py status          # volume + current context
python3 tvctl.py probe           # which endpoints this TV supports
python3 tvctl.py volume          # read volume
python3 tvctl.py volume 25       # set volume
python3 tvctl.py mute            # toggle mute
python3 tvctl.py key Home        # any remote key: Back, Confirm, ArrowUp, ...
python3 tvctl.py keys            # list all known keys
python3 tvctl.py settings        # dump the settings-menu node tree
python3 tvctl.py channels        # installed channel lists
python3 tvctl.py post /6/audio/volume '{"current":10,"muted":false}'   # raw request
```

The CLI is deliberately script-friendly: stable output, no interactivity
except `pair`, so you can automate your TV from cron, Home Assistant, or an
LLM agent.

## What works / what doesn't

| Capability | Works | Notes |
|---|---|---|
| Volume + mute | ✅ | read and write |
| Remote keys | ✅ | 44 keys mapped; `Cursor*` names navigate the home screen, `Arrow*` work in apps |
| Home-screen navigation | ✅ | `CursorUp/Down/Left/Right` key names move the focus |
| System info | ✅ | serial/firmware decrypted (AES-CBC with the firmware's shared key) |
| Context (what's on screen) | ✅ | |
| Settings menu tree | ✅ | read-only; writing values needs the TV's own settings UI open |
| Channel lists | ✅ | read |
| Source/app switching | ❌ | endpoints exist but are feature-disabled in firmware |
| Power state | ❌ | POST accepted but silently ignored; use the Standby key instead |

## Key names (verified against the TV)

| Action | Key name |
|---|---|
| Home-screen navigation | `CursorUp` `CursorDown` `CursorLeft` `CursorRight` |
| In-app navigation | `ArrowUp` `ArrowDown` `ArrowLeft` `ArrowRight` |
| Channel stepping (live TV) | `ChannelStepUp` `ChannelStepDown` |
| Channel list | `List` |
| Colour actions | `RedColour` `GreenColour` `YellowColour` `BlueColour` (context-dependent — e.g. `GreenColour` toggles channel favouriting in the channel list) |
| Media | `PlayPause` `Stop` `FastForward` `Rewind` `Next` `Previous` |
| Misc | `Home` `Back` `Options` `Confirm` `Info` `Find` `Adjust` `Source` `Teletext` `Subtitle` `Dot` `Digit0-9` |
| Power | `Standby` (actually powers off) |

Names matter: the same physical button maps to different JointSpace key
names depending on the target UI (`Cursor*` for the Titan web app,
`Arrow*` for in-app focus lists). Discovered by brute-forcing 46 candidate
names against a live TV.

## Troubleshooting

- **Connection refused / nothing answers** — the TV's API daemon sometimes
  wedges after protocol violations. Unplug the TV at the wall for ~30
  seconds (standby is not enough) and retry.
- **`CONCURRENT_PAIRING`** — a previous pairing session is still open; wait
  ~40 s and try again.
- **Discovery finds nothing** — some networks isolate clients (AP/client
  isolation on Wi-Fi). Use `pair --host <IP>` with the IP from your router.
- **PIN expired** — it's valid for 30 seconds; just re-run `pair`.

---

# Reverse-engineering notes

*The rest of this file documents the protocol for people who want to extend
the tool or port it to other TVs. The sections above are all you need to
use it.*

## Discovery

Every Philips TV with the JointSpace API answers on the LAN:

```bash
curl http://<tv-ip>:1925/6/system          # legacy port, no auth
curl -k https://<tv-ip>:1926/6/system      # v6, some fields AES-CBC encrypted
```

The response includes `"os_type": "Linux"` (Saphi) or `"MSAF_..."`
(Android), `pairing_type: "digest_auth_pairing"` and
`secured_transport: true`.

The TLS certificate is self-signed, CN `2K22_PHP_LINUX`, issuer
`SMTVXTVROOT`, O `TPV Technology Limited` — TPV is the ODM that actually
manufactures these TVs.

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

- **username** = the `Client.id` you sent in pair/request (*not* the
  Signature, and *not* a device UUID as the Home Assistant library
  assumes)
- **password** = the `auth_key` from the pair/request response
- realm `XTV`, `qop="auth"`, standard MD5 digest

Those same credentials then authenticate every other `/6/*` endpoint.

## The three firmware quirks (the research contribution)

### 1. TLS fingerprinting blocks Python's default handshake

`urllib.request` (anything using Python's default `ssl` cipher preference)
gets an **instant 403 Forbidden** on *every* endpoint — even
`pair/request`. curl against the same URL works fine. Setting an explicit
OpenSSL cipher list (`transport.CURL_CIPHERS`) makes Python's `ssl` module
negotiate like curl and everything works. The TV is evidently doing
JA3-style fingerprinting and allow-listing known clients — rare on
consumer hardware.

### 2. The pairing grant must use a single TCP connection

`POST /6/pair/grant` draws a 401 with a `WWW-Authenticate` challenge. The
authenticated retry **must go over the same TCP connection**. curl's
`--digest` opens a second connection for the retry — and that wedges the
TV's JointSpace daemon so completely that *every port stops answering*
until the TV is power-cycled at the wall. Reproduced every time.

General `/6/*` endpoints are the opposite: they **expect** the challenge
on one connection and the authenticated request on a fresh one (reusing
the nonce is fine). Sending an authenticated request as the *second*
request on the same connection to `/6/*` makes the TV close the socket
silently.

`transport.py` therefore has a `single_connection` flag used only for the
grant.

### 3. `curl --digest` cannot POST (503)

The TV answers a *body-less* POST with `503 Service Unavailable` — it
never emits a challenge for empty bodies, so curl's two-pass digest dance
for POST methods never completes. Any client that sends the body on the
first attempt (like this library) is unaffected.

## Home-screen navigation: the `Cursor*` key names

The home screen web app **does** have a focus model — it just doesn't
listen for `ArrowUp/Down/Left/Right`. The key names it maps are
**`CursorUp` / `CursorDown` / `CursorLeft` / `CursorRight`** (discovered
by brute-forcing 46 candidate key names while watching the screen, then
confirming with a Z-pattern test the focus visibly traced).

`Arrow*` names remain useful: they work inside apps that have their own
in-app focus (settings lists, etc.).

The `/6/input/pointer` endpoint (absolute/delta coordinates) also exists
and is accepted — but on models without a touchpad remote no cursor is
rendered, so it has no visible effect. It is vestigial code shared with
higher-end models.

**Bottom line:** full home-screen navigation works over JointSpace with
`Cursor*` key names. `tvctl key CursorRight` and the GUI arrow pad both
use them.

## The home screen is a cloud web app

The home page streams from `https://app.titanos.tv/` (CloudFront). Titan
OS is the company Philips licensed its entry-level smart-TV OS to; TPV
builds the hardware. Everything on the home screen is served remotely,
which is why the sponsored content can be removed with a DNS blocklist
rather than firmware surgery — see the debloating section above. The
launcher can also be re-configured remotely by Philips/Titan at any time,
independent of firmware updates.

## Decrypting `/6/system`

`serialnumber_encrypted`, `softwareversion_encrypted`, `model_encrypted`
are AES-128-CBC with a **hardcoded key shared across all Philips TVs**
(also present in the HA library source):

```
key = base64("ZmVay1EQVFOaZhwQ4Kv81ypLAZNczV9sG4KkseXWn1NEk6cXmPKO/MCa9sryslvLCFMnNe4Z4CPXzToowvhHvA==")
```

Payload layout: `base64(IV || ciphertext)`, PKCS7-padded plaintext.
`tv.py:cbc_decode` shells out to the `openssl` CLI to avoid a dependency.

## Scope: what full-scope pairing does and doesn't unlock

A pairing made with the HA-library format
(`{"access":{"scope":["read","write","control"],"featuring":<blob from
/6/system>},"device":{...}}`) completes successfully (note: without the
`featuring` blob this TV 403s the request itself) and yields credentials
with claimed full scope. Yet `sources`, `applications`, `channels` and
`timer` still return 403 with those credentials — the endpoints are
**feature-disabled at firmware level** on this Saphi build, not
scope-gated.

## Debugging notes (if you hit the same walls)

- When the daemon wedges: **unplug the TV at the wall for ~30 s**. Standby
  does not restart the daemon.
- `CONCURRENT_PAIRING` from `pair/request` means the previous pairing
  session is still live — wait ~40 s for it to expire.
- Requests from Python's `urllib` fail *silently* — always compare with
  curl before assuming the server is broken.
- Authenticated requests to `/6/*` on a reused connection close the
  socket instead of erroring — easy to misread as a network problem.

## Repo layout

```
philips_tv/
  transport.py   HTTPS + manual digest auth, single-connection support
  pairing.py     pair request/grant flow
  discovery.py   mDNS/SSDP/subnet discovery (TVs announce _philipstv_s_rpc._tcp)
  tv.py          endpoint wrappers, AES decryption, known keys
  config.py      credential storage (~/.config/philips-tv-rea)
  gui.py         tkinter control console
tvctl.py         CLI entrypoint
```

## Credits / prior art

- [`ha-philipsjs`](https://github.com/danielperna84/ha-philipsjs) (Home
  Assistant) — the shared AES key and the general pairing shape come from
  here. The Saphi quirks above are all places where this firmware
  *differs* from what HA expects.
- [hagezi's DNS blocklists](https://github.com/hagezi/dns-blocklists) —
  TV/telemetry blocklists that complement the Titan OS block.
- [jointspace.tv](https://jointspace.tv) — fragments of the original
  JointSpace documentation.

## License

MIT — see [LICENSE](LICENSE).
