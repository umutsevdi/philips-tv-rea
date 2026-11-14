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

## U1: Are firmware bridges origin-gated? [?]

The biggest fork in the roadmap. Test: probe page in the TV's Internet browser
logging `typeof window.loadApp` (08, Phase 0). If bridges appear there, any
origin can launch apps.

## U2: Can the firmware browser load plain HTTP on a pinned origin? [?]

Needed for the DNS-override swap, since a valid TLS cert for the pinned domain
is impossible. Test: router DNS override, serve HTTP, see if the TV loads it
or hard-fails. Also test HSTS or cert pinning.

## U3: Telemetry endpoint host [?]

Event payload builders are known; the destination host is not. Test: find the
`fetch(` call site near the payload builder in main-*.js, or capture TV
traffic with mitmproxy.

## U4: Exact auth header format [?]

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

## Recommended order

1. U1 probe page: minutes, zero risk, forks the whole plan
2. U7: static read of the service worker
3. U3/U4: one mitmproxy session, needs the TV to trust your CA; if that
   fails, re-read the bundles
4. U8 only if JVC and other brands matter
