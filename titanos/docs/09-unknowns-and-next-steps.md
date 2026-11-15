# 09. Unknowns and next steps

Claims in these docs are tagged: **[O]** observed directly in a bundle,
**[I]** inferred, **[?]** unknown, needs runtime verification.

Provenance: the production SPA fetched on 2026-11-14 with curl and a
spoofed smart-TV user agent. Assets: `/` (index, version 1.241.1-rc.5),
`/assets/main-CrBAgRaF.js` (React UI, Redux, banners, telemetry, MQTT),
`/assets/useCustomKeyDown-BWJfSd9U.js` (device API, keymaps, launch dispatch),
`/assets/endpoints-BXY-ZF0n.js`, `/assets/simple-setup-DRgKV_fk.js`,
`/assets/mock-C3YGHwIt.js`, `/lib/zeasn_sdk.js`. Bundle hashes rotate with
releases; re-fetch `/` first to learn current names. The backend requires the
firmware-issued token, so unauthenticated requests only return the SPA shell.

Every open question, with the cheapest test that answers it:

## U1: Are firmware bridges origin-gated? — partially answered [O]

On-device 2026-11-15: the Internet browser app injects none of the dialect
members (probe verdict 0/N) — the dialect is bound to the launcher webview.
Remaining half: serve our page from the pinned launcher origin (DNS
override, U2) and re-probe.

Older note retained for context: [?]

The biggest fork in the roadmap. Test: probe page in the TV's Internet browser
logging `typeof window.loadApp` (08, Phase 0). If bridges appear there, any
origin can launch apps.

## U2: Can the firmware browser load plain HTTP on a pinned origin? [?]

Needed for the DNS-override swap, since a valid TLS cert for the pinned domain
is impossible. Test: router DNS override (`app.titanos.tv` → your server;
leave `eu.app.titanos.tv` real so the page still pulls live data), serve
HTTP first, then self-signed HTTPS. Watching for: `chunk_load_error`
reload loops (01) mean TLS was accepted and only asset handling failed —
good news. Side effect when it works: the firmware's boot URL with the
full `?jwt=` device token lands on your server in the clear, which also
makes the token replayable from a laptop for direct API experiments.
Passive sniffing cannot capture the token: it only travels inside TLS.

## U3: Telemetry endpoint host [?]

Event payload builders are known; the destination host is not. Test: find the
`fetch(` call site near the payload builder in main-*.js, or capture TV
traffic with mitmproxy.

## U4: Exact auth header format — SOLVED [O]

Extracted from the 1.241.1 bundles on 2026-11-15:

- Token chain: `window.getToken()` → `localStorage['api_auth_token']` → device
  JWT from the launcher URL `?jwt=` param (persisted as `device_auth_token`).
- Header: `Authorization: Bearer <jwt>` on every authed request.
- Every request appends common query params: `market`, `device=tv`, `locale`,
  `firmware`.
- Token rotation: successful responses carry the successor JWT in the
  `authorization` response header; the client stores it for later calls.
- Sign-in: `POST /sign_in` (device JWT in the auth header; body with
  `{device_uuid, session:{brand, firmware, model}}` only when the device JWT
  is invalid). Sign-up: `POST /me/sign_up?model=…&ip_virtual_network_id=…`.
- On 401: `window.refreshToken()`, then one retry.

Older note retained for context:

The token arrives via URL and `getToken()`; the header name is unknown.
Test: read the request-builder `h_` in the bundle, or runtime capture.

## U5: Is the launcher URL firmware-pinned or remotely provisioned? [?]

If a backend config returns the launcher URL, an env switch might change it;
if firmware-pinned, only DNS tricks work. Test: watch boot traffic.

## U6: QA mode's full effect [?]

The `_qa_env_enabled_` marker and dev modals are known; whether it enables
`getEnvUrl()`/backend env selection is not. Test: trigger the combo
(left, right, left, right) on-device and capture requests.

## U7: Service worker cache behavior [?]

`vite-plugin-pwa` is present; caching strategy unknown. Read `/registerSW.js`
and the SW source. Static, free.

## U8: Vestel (JVC) parity [partial]

`vestel.html` exists with its own envs and a different device class (OIPF
config, portaltv.tv swf bridges). Fetch it if other brands matter.

## U9: Does `getEnvUrl` accept arbitrary hosts? [?]

If yes, a local API proxy could feed the stock launcher curated content
without replacing the page. Test: Phase 0 probe + QA mode.

## U10: Deeplink URL patterns per app [partial]

Dispatch mechanics are known; partner URL grammars are not (Netflix cert
flow, Prime `gti=`, DAZN `{TargetName}`). Capture real deeplinks at runtime.

## U11: Launch URL of an installed store app [?]

The app store catalog publishes bundle_id (e.g. `ibo_player`) but not the URL
the launcher uses to open the app. Options: read it from `/apps/<id>` or the
device app list via a probe page, or capture it while the stock launcher opens
the app. Needed for tiling store IPTV players (08).

## U12: What does the stock store's Install actually call? [?]

Candidates: a backend POST recording the app on the device, or an OIPF
app-manager bridge (`application/oipfApplicationManager` is instantiated in
the device API, but the observed code only uses it for keyset registration).
Test: capture TV traffic while installing a store app, or set a breakpoint on
the store page's button handler. Answers whether a replacement launcher needs
any extra call for its own on-demand catalog (08) or whether a local config
entry is enough.

## Recommended order (revised 2026-11-15)

1. ~~U1 probe~~ — done: dialect bound to the launcher webview (0/N in the
   Internet browser).
2. ~~U4 header format~~ — done: Bearer + token chain, see U4 above.
3. **U2 DNS override** — next, highest value: one router entry + a logging
   server answers whether we can own the home screen AND captures the boot
   token in the same experiment.
4. U11: install one IPTV player in the TV store, extract its URL (one probe
   run).
5. U12/U3: one mitmproxy session answers both; needs the TV to trust your
   CA; if that fails, re-read the bundles. U4 no longer needs this.
6. U7: static read of the service worker (free, anytime).
7. U8 only if JVC and other brands matter.
