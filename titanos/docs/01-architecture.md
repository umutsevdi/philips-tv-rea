# 01. Architecture

## What Titan OS is [O]

Titan OS (Titan OS S.L, Barcelona) is a Linux-based smart-TV OS on Philips
(TPV), JVC, Sharp and AOC TVs in Europe and LATAM. Dev docs:
<https://docs.titanos.tv>. Apps are hosted HTML5 pages (you give Titan a
URL); the TV browser is a Chromium derivative (Vewd/Whale lineage); no
arbitrary sideloading, apps go through Titan's intake.

## Runtime layers [O/I]

```
Linux firmware
└─ browser (Chromium/Blink, per UA sniffing in zeasn_sdk.js)
   ├─ native app manager: ApplicationController, loadApp, loadLocalUI
   ├─ NPAPI-style plugin: <object id="BrowserIpcPluginClass"
   │       type="application/browser-ipc-2">  (in index.html head)
   └─ launcher SPA = the home screen
```

A teardown of a Philips 9000 series confirms the layout: browser at
`/usr/opera/browser_dir`, data in `/mnt/browser/browser_home`, every app is a
webpage, remote keys arrive as key events [O, third-party]. The launcher HTML
is served for any path on the origin (`/me/pages` returned the same HTML with
200) [O].

## Launcher SPA [O]

- React 18, Redux Toolkit, react-router, Vite, i18next.
- `window.APP_VERSION = '1.241.1-rc.5'`, plus `APP_COMMIT` and `APP_REVISION`
  stamped at build time.
- Brand split at build time: `window.deviceBrand = 'philips'` in index.html;
  a separate `vestel.html` entry exists (`vite.vestel.config.ts` comment).
- Chunks: `logger-service`, `useCustomKeyDown` (the device API),
  `simple-setup`, `endpoints`, `ShakaPlayer`, `mock` (subscription UI mocks).
- Boot picks a device class: `vestel` → `ia`, `philips`/`jvc` → `B`,
  anything else warns and falls back to the Titan base class.

## PWA and reload resilience [O]

- `registerSW.js` + `vite-plugin-pwa` manifest. Caching strategy not
  extracted (09, U7).
- `criticalAssetMonitor` in index.html: any critical chunk failure reloads
  the page after 5 s, writing `?reload_reason=entry_script_error` or
  `chunk_load_error` to the URL first. A replacement launcher must serve
  stable asset URLs or it will reload-loop.

## Startup pieces [O]

- `simple-setup` chunk: gates on firmware version
  (`window.getSWVersion()` or `localStorage['ufversion']`) against minimum
  versions (e.g. 246.004.147.081 for PH690 4K), then calls
  `window.loadLocalUI('simple_setup')`; gives up after 10 polls of 500 ms.
  Old firmware gets a localized "Software update required" screen. The
  first-run wizard is itself a web page.
- `NetworkBandwidthFromPlatform` DOM event and
  `window.notifyPlatformUpdateNetworkSpeed(testType, waitTime, requests)`:
  the page asks the firmware to run a speed test (fast.com or a big-file
  download); the result lands in `window.downlinkEstimate`.
- `window.NotifyLauncherVersion(version)` reports the page version to the
  firmware on load.

## Loading screen [O]

A static `#loader` div (Philips logo, progress bar, "powered by Titan")
renders before React mounts.

Provenance: index.html, main-CrBAgRaF.js, useCustomKeyDown-BWJfSd9U.js,
simple-setup-DRgKV_fk.js, docs.titanos.tv, habr.com teardown.
