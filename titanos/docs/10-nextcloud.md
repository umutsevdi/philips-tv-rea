# 10. Nextcloud photo browser

The launcher's Drive screen (Nextcloud): a D-pad browser for a self-hosted Nextcloud,
built into the launcher rather than launched as a webapp.

## Why built-in, not a webapp [O/I]

- The stock Nextcloud web UI (and Memories SPA) are pointer/keyboard
  interfaces; no Nextcloud TV webapp exists [O, researched 2026-11-15].
- Android TV Nextcloud viewers are APKs — unusable on Saphi.
- WebDAV is a built-in Nextcloud endpoint (open standard); the launcher
  can render it natively with the existing spatial engine, back stack and
  focus system.
- Memories' JSON API (`/apps/memories/api/days`, previews) is a clean
  upgrade path if the user installs Memories later.

## Architecture [O]

```
launcher SPA ──proxy-relative URLs──▶ proxy ──HTTPS+Basic──▶ Nextcloud
  (no creds)              (creds in config.json, 0600)
```

- `/api/nc/list?path=/Photos` — depth-1 PROPFIND, parsed server-side to
  `[{name, path, isDir, mime, size, mtime}]`, dirs first.
- `/api/nc/file?path=…&w=&h=` — images go through Nextcloud's
  `/core/preview` (server-resized; 256px tiles, 1280px viewer); other
  files stream raw with Range passthrough (video seeking).
- Credentials never reach the webview (plan R7).

## Configuration

1. Nextcloud: Settings → Security → Devices & sessions → create an
   **app password** (do not use the main password).
2. Add the section to the app's single config file
   `~/.config/philips-tv-rea/config.json` (0600):
   `{"nextcloud": {"base": "https://your-cloud.example.com", "user": "you", "app_password": "ABC…"}}`
3. `node build` — the config file is the only source; no env vars.

Without config, `/api/nc/*` returns 503 and the browser screen shows an
inline, focusable error state (never a dead screen).

## UX model [I]

- Starts at the WebDAV root `/` on first use, then reopens the last folder
  browsed (localStorage `launcher.nc.lastpath`); a remembered folder that
  no longer exists falls back to root. Back pops one folder level; at root
  Back returns home with focus restored to the Photos tile.
- Grid: rows of 6, tiles stretch flush to the safe area (same math as the
  Apps screen); folders folder-plate, images preview thumbs, videos a
  live-badge play plate.
- Viewer: full-screen, D-pad left/right steps, OK toggles the info bar
  (name + position, tabular-nums), green key or long-press OK runs a 6 s
  slideshow, any D-pad key stops it, Back closes one level.
- Videos play inline via `<video>`; H.264 MP4 is the safe assumption on
  this chipset (HEVC/MKV depend on hardware decode — unverified, docs/09).

## Mock policy

The Nextcloud screen is real-data-only on every surface: it talks to the
configured server through the proxy or shows the error state. No demo
fixtures (the demo-data rule from the main build applies).

Provenance: plan (session 2026-11-15), proxy/server.py `/api/nc/*`,
launcher `src/lib/api/nextcloud.ts`, `NcBrowser.svelte`, `NcViewer.svelte`,
`ncstate.ts`; Nextcloud WebDAV + preview endpoints; Memories API research.
