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
- App tiles: `tiles.json` fallback always renders; when the TV's
  `getToken()` works and Titan's backend accepts us, `/me/pages` replaces
  it with real favorites plus up to two content rows (`apps_list`,
  `favorites_list`, `top_movies_list`, `on_now_list` only — banner lists
  never load).
- Launch dispatch mirrors docs/03: `loadLocalUI` natives, Netflix/AIV
  bridges, FVP via `getAit` → AIT deeplink, generic `loadApp` webapps.
- Remote navigation: D-pad spatial focus with rect-center scoring, back
  key (461) stack, color keys mapped, long-press, focus persistence.
- Channel cards: from the TV's `/6/channeldb/tv` via the proxy; OK tunes
  by digit keys.

## Performance constraints (docs/08)

- Bundle: ~28 KB gz total (budget 150 KB). Lucide icons are named
  imports — never `import *`.
- Animations: transform/opacity only, ≤200 ms, none on the keypress path.
- Keydown handler defers work with `setTimeout(..., 0)`; scroll uses rAF.
- Build target es2019 for the TV's older Blink.

## Open on-device probes (docs/09)

1. U1: are `window.loadApp`/bridges available off the launcher origin?
2. Keycode capture: confirm 461 back and 401–406 colour keys on-device.
3. Broadcast chain: which of `launchLinearChannel`/`loadLocalUI`/AIT works?
4. `getToken()` header format (U4) if the backend rejects our Bearer guess.
5. TV API daemon health: `tvctl.py status` — 404-empty means wedged,
   needs a 30 s wall power-cycle.
