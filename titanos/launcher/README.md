# Titan OS replacement launcher (PoC)

Svelte 5 + TypeScript + Vite static SPA. Speaks the firmware dialect
documented in [`../docs/`](../docs/) — launch bridges, HbbTV keymap —
and renders app tiles, content cards and TV channel cards with no ad or
telemetry pipeline.

## Run

```bash
npm install
npm run dev          # desktop browser; firmware bridges are mocked
npm run build        # static build in dist/
npm run check        # svelte-check + tsc
```

Serve the build against a real TV with the proxy (handles digest auth,
self-signed cert, and the 0.7 s request gate on the TV side):

```bash
npm run build
python3 ../proxy/server.py --tv 192.168.1.239 --port 8080
# open http://<this-host>:8080/ on the TV (set as browser bookmark)
```

## What works today

- Broadcast tile: probes `launchLinearChannel`, then `loadLocalUI`-class
  bridges (U1 origin-gating still unverified — see docs/09).
- App rows: tier-1 natives + tier-2 bridges (Live TV, Netflix, Prime Video)
  plus pinned catalog apps, balanced across two rows; tiles are equal
  shares of the full row width (`flex-basis: 0`), so every row ends flush
  at the safe-area edge whatever its count; the **All apps** tile always
  terminates the last row.
- Apps screen: the third-party catalog. Three sources merged by id
  (docs/03): `catalog.json` (committed fallback) → backend `/me/apps`
  (engages when the token probe lands, 09/U4) → device `DEVICE_APPS` FVP
  inventory (09/U11). OK opens options: **Open** or **Pin/Remove from
  home**; pins persist in `localStorage` (seeded with a starter set on
  first run) and appear live on the home row with a pin badge.
- Dedicated remote app keys (Netflix/YouTube/Disney+/Prime) map to app ids
  by key name; unknown keys are logged with their keyCode for the
  on-device capture that fills the table (09/U-probe).
- Home: hero + app rows + an **On now** showcase row (shows with artwork +
  source badge, deeplinked per docs/03) above a **Watch live** channel row.
  No paid promo rows, no banner lists (docs/05) — the stock
  launcher's show volume is mostly advertising; we don't imitate it.
- Launch dispatch mirrors docs/03: `loadLocalUI` natives, Netflix/AIV
  bridges, FVP via `getAit` → AIT deeplink, generic `loadApp` webapps.
  Without the dialect, URL-carrying specs degrade to same-tab navigation
  in TV browser shells (popup-blocker-safe; Back returns via history) and
  stay console-mocked on desktop.
- Remote navigation: D-pad spatial focus; vertical moves are row-banded
  (nearest visual row always wins, so sparse/capped rows never get skipped
  by a far column match), column memory within rows, back key (461) stack,
  colour keys, focus persistence, home/apps view scoping, glass dialogs
  (exit confirm, app options). Pointer-mode adapters: in browser shells
  that drive a virtual cursor (the TV's Internet app), hover focuses and
  the native click activates — the real deployment (webview via DNS
  override) delivers D-pad keydowns directly, as the stock launcher does.
- Channel cards: from the TV's `/6/channeldb/tv` via the proxy; OK tunes
  by digit keys.
- Try-real-first boot: every source is attempted at load and fails soft to
  demo data per source — `/me/apps` + `/me/pages` return null without the
  firmware token (U4), the proxy's channels return null on a dead daemon,
  so demo content fills only what stayed empty. All fetches are bounded
  (4 s abort) so an unreachable host can't stall boot; `?instant` skips
  the network entirely for fast UI work.
- Old-Blink safety: no flex `gap`, no `aspect-ratio` without fallback, no
  `backdrop-filter`, no `inset` shorthand — everything margin/flow based.

## Performance constraints (docs/08)

- Bundle: ~35 KB gz total (budget 150 KB). Lucide icons are named
  imports — never `import *`.
- Animations: transform/opacity only, ≤200 ms, none on the keypress path.
- Keydown handler defers work with `setTimeout(..., 0)`; scroll uses rAF.
- Focus reveal scrolls ancestors explicitly (never `scrollIntoView` — the
  TV's Blink predates its options object): horizontal tracks rest the
  focused card centered in the padded box, vertical scrollers keep their
  padding visible as the resting inset (hero's top gap can't be scrolled
  away). Instant fallback where smooth scrolling is unsupported.
- Build target es2019 for the TV's older Blink, plus a post-build HTML fix
  (`scripts/fix-html.mjs`): the bundle is served as a classic `defer`
  script — a `type="module"` tag is silently ignored by engines without
  module support (the TV's browser app showed a blank page where a phone
  rendered fine). `index.html` also inlines small shims
  (`Promise.finally`, `replaceAll`, `globalThis`, `ResizeObserver`) and an
  on-screen `launch-debug` error bar that surfaces boot failures on the TV
  itself.

## Open on-device probes (docs/09)

1. ~~U1~~ **Answered on-device:** the Internet browser has none of the
   injected members (probe verdict: 0/N) — the dialect is bound to the
   launcher webview. Re-run anytime with `probe.html` (built into `dist/`).
   Remaining half: serve our page *from the pinned launcher origin* (U2).
2. **U2 DNS override** — the next experiment: router entry
   `app.titanos.tv` → our server; proves whether we can own the boot
   screen and captures the firmware's `?jwt=` token in the same run.
3. Keycode capture: confirm 461 back and 401–406 colour keys on-device.
4. Live backend shape: with a token (from U2 or mitmproxy), verify our
   `/apps` + `/epg` parsing against real responses (the envelope is still
   inferred: array vs `{apps:[…]}`).
5. TV API daemon health: `tvctl.py status` — 404-empty means wedged,
   needs a 30 s wall power-cycle.
