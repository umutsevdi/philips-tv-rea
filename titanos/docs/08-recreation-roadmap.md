# 08. Recreation roadmap

Goal: a replacement page that speaks the same firmware dialect, renders your
apps without ads or telemetry, and supports custom tiles.

## Phase 0: Runtime probes (do these first)

1. **Origin-allowlist test.** Open `http://<your-host>/probe.html` in the TV's
   Internet browser. The page logs `typeof window.loadApp`,
   `window.getCountry?.()`, `typeof ApplicationController`,
   `navigator.userAgent`, and every keydown code from the remote.
   - Bridges present: any page can launch apps. Easy path.
   - Bridges absent: they are gated to the registered launcher origin, and a
     replacement needs the DNS route (Phase 3) with its TLS problem.
2. **Keycode confirmation.** Capture every remote keydown from any page.
3. **API reachability.** From the probe, fetch `eu.app.titanos.tv/me/apps`
   with `getToken()` if available. This proves you can reuse Titan's backend
   without their frontend.

## Phase 1: Static replacement shell (safe, reversible)

Serve a page that:

- Listens for the keymap (02): back `461`, colors, arrows, enter.
- Renders tiles from a local JSON config, no backend:
  ```json
  { "tiles": [{ "name": "YouTube", "launch": {
       "kind": "loadApp",
       "url": "https://www.youtube.com/tv?launch=menu",
       "appType": "NetTVSpecial", "resolution": "1080p" }}]}
  ```
- Maps launch actions per the tier table (03): `loadApp(...)` for webapps,
  `loadLocalUI(id)` for native screens, `GotoNetflix(url)` for Netflix,
  `ApplicationController.launchApplication(x, 2)` for FVP.
- Does its own focus and keyboard navigation; long-press detection like the
  stock `NCe({targetKeys, onLongPress})`.

## Phase 2: Titan backend integration (optional)

- Acquire a token via `window.getToken()`; call `/me/apps`, `/me/pages` to
  render real favorites and app rows, minus `banner_list` types. No ad slots.
- Reuse the deeplinkings schema (04) and the launch dispatch mapping.
- Risk: the backend may reject modified clients, and ToS questions apply.
  Keep the local-only mode working as a fallback.

## Phase 3: Replacing the stock launcher entry point

Ordered by practicality:

1. **Browser-app pin.** Put your page in favorites as a `free_channels`-style
   tile. Zero firmware risk, but not the boot default.
2. **QA/env switching.** `_qa_env_enabled_` plus `getEnvUrl()` redirect the
   API host only, not the launcher page.
3. **DNS override.** Router DNS points `app.titanos.tv` at your server.
   TLS is the blocker: you cannot get a valid cert for a domain you do not
   own, so this needs plain HTTP to work (test in Phase 0, unknown U2). If
   HTTP works, you own the home screen.
4. **Titan dev/portal intake** (docs.titanos.tv): the sanctioned way to have
   your URL registered as an app.

## UI framework choice

Svelte 5 in static-SPA mode (adapter-static, no SSR). Reasons:

- The launcher is one fully interactive, focus-driven surface. Astro's
  islands/partial-hydration advantage does not apply; a single all-hydrated
  island is just extra build overhead.
- Svelte compiles to direct DOM operations: no virtual DOM diffing on the
  keypress hot path, which is what makes the stock React+Redux launcher feel
  laggy on this chipset (Novatek, 1.5 GB RAM).
- Bundle target under 150 KB total, versus the 2.3 MB stock main chunk.

The performance-critical component is not the framework but the custom
spatial-navigation engine (grid registry, arrow-key resolution,
scroll-into-view, long-press, back stack). Budget most of the effort there.

Rules that matter more than the framework choice:

- Animate only `transform` and `opacity`; 100-200 ms durations; no blur or
  shadows on moving elements.
- Virtualize long rows (viewport plus buffer), unlike the stock launcher's
  dim-off-screen approach.
- Conservative Vite build target (`es2019`-ish); the TV browser fleet is old
  Blink. Verify `:has()` and friends on-device in the Phase 0 probe.
- Split long tasks (`setTimeout`/`requestIdleCallback`) so the browser can
  process the next keypress; this is Titan's own published advice.

## Design invariants [O-derived

- Serve stable immutable asset URLs, or the page reload-loops (01).
- Guard every bridge call (`?.`); brand variants differ.
- Keep the `<object id="BrowserIpcPluginClass">` tag if you need payment IPC.
- Persist last-focused tile; mimic resume behavior on app return.
- Respect tab-visibility: the stock launcher pauses pairing and modals when
  `document.hidden`, and coordinates with the screensaver
  (`getScreenSaverOptions`, `onScreensaverToggle`).

## On-demand app catalog (a homemade app store)

Store apps are webapps, so the stock store's "install" is only a backend
record plus firmware registration; no package is downloaded. The launcher can
reproduce the model without Titan's store:

- Ship a catalog file (`catalog.json`): `{name, icon, url, app_type,
  resolution}` per app.
- An "Add app" screen lists the catalog; installing adds the entry to the
  home-screen config in localStorage.
- Launch goes through the same `loadApp` dispatch as pinned tiles.
- Native apps (Netflix, Prime, YouTube, Disney+) are already in the firmware;
  they need no install, only entries in the dispatch table.

What the stock store offers that this does not: private app URLs (U11),
curated updates, and firmware registration for broadcast/FVP apps (those are
either already present or unavailable).

The one open mechanism question is how the stock store performs the firmware
side of an install (U12); capturing it once settles whether any extra bridge
call is needed.

## IPTV via a store player

IPTV players (Top IPTV Smarters, IBO Player, ...) are tier-3 webapps; no
native IPTV client exists in the firmware. Two ways to use one with the
replacement launcher:

1. **Install in the TV's app store, then tile it.** The install registers the
   app with the firmware; the launcher learns its launch URL from the apps
   API (or the device app list). Extract that URL once (09, U11) and put it in
   the tiles config as a normal `loadApp` entry.
2. **Skip the store.** Host your own M3U/EPG client (hls.js or mpegts.js cover
   what Chromium cannot play raw) and tile that instead. Plain M3U/Xtream
   streams work in the browser; DRM-protected operator IPTV needs the TV's
   EME/PlayReady path and is harder.

Note: the store catalogs at partners.titanos.tv list bundle_id and store_id
per app but not the launch URL, so route 1 needs the on-device step first.

## Custom apps

- Tier-3 style: any URL plus `loadApp(url, name, app_type, resolution)` is an
  app. Remote-friendly pages need focus outlines, arrow-key navigation,
  back-key handling, TV-sized text, and no hover-only UI.
- Register tiles in your local config (Phase 1) or via the favorites API
  (`/me/apps` POST, needs auth, Phase 2).

## No-ads and de-bloat summary

| Want | Do |
|---|---|
| No banner ads | Render no `banner_list`/`side_promotion` lists (replacement), or DNS-block SpringServe/Equativ plus trackers (stock) |
| No telemetry | Block the telemetry host (09, U3) or omit senders (replacement) |
| No voucher popups | Skip `voucher_campaign` targets |
| Keep Netflix/Prime | Their launch bridges are firmware-side; keep the actions, drop their promo tiles (`netflix_list`, `prime_video_list`) |

Provenance: synthesis of 02, 03, 04, 05 and index.html behavior.
