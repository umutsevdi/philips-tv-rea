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

## Design invariants [O-derived]

- Serve stable immutable asset URLs, or the page reload-loops (01).
- Guard every bridge call (`?.`); brand variants differ.
- Keep the `<object id="BrowserIpcPluginClass">` tag if you need payment IPC.
- Persist last-focused tile; mimic resume behavior on app return.
- Respect tab-visibility: the stock launcher pauses pairing and modals when
  `document.hidden`, and coordinates with the screensaver
  (`getScreenSaverOptions`, `onScreensaverToggle`).

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
