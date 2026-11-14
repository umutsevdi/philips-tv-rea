# 03. App launch model

## Three tiers [O]

The launcher classifies every tile it renders. Dispatch in
useCustomKeyDown-BWJfSd9U.js:

```
action `launch-app`:
  c = Ar[app.code]        per-app override handler
  l = Tr(app.code||name)  "locally installed" per device list
  u = app.isFVPApp || provider==='freely' || wr(name||id||code)
  f = deeplink starts with 'localfunction:gotoaiv'
  if (l && c)  per-app override
  elif (u)     launchFVPApp (AIT path)
  elif (c)     per-app override
  elif (f)     launchPrimeVideo
  else         launchResource(url, name, app_type, resolution)   ← generic
```

### Tier 1: Native firmware UI (not apps) [O]

`loadLocalUI(...)`: settings, Wi-Fi, EPG, channel list, input sources, media
player, Google Assistant, Alexa, HD+, Play-Fi, Freely, Matter smart home,
browser app, BT wizard, demo mode, consent page (`launchCMP`), update wizard.
`tune-tv-channel` calls `launchLinearChannel(channelNumber, invokeMethod,
sid)` and tunes the tuner directly.

### Tier 2: Embedded apps with firmware bridges [O]

| App | Bridge |
|---|---|
| Netflix | `GotoNetflix(url, source)` + `getNetflixInfo` + impression reporting (`send-netflix-impressions`) |
| Prime Video | `GotoAIV`, `requestPrimeRecommendations`, `gti=` deeplink rewriting |
| Freeview Play / Freely (BBC iPlayer, ITVX, All 4, My5, UKTV Play) | `getAit(url,'homepage',isTemplate,cb)` → `ApplicationController.launchApplication(deeplink, 2)`: DVB AIT signalling, apps live in the broadcast stack |
| Internet browser | `loadLocalUI(browser)` / `GotoOpenInternet`; the browser itself is native |

### Tier 3: Hosted webapps [O]

Everything else: `loadApp(url, name, app_type, resolution)` loads the partner
URL in the TV browser. Catalog codes in enum `L`: `rakuten_tv, dazn, apple_tv,
disney, britbox, freeview_explore, media(+_jvc/_sharp), internet_browser
(+_jvc/_sharp), free_channels, simple_setup, hd_plus, play_fi, freely,
google_assistant, alexa, demo_me, netflix, prime_video, bbc_iplayer,
bbc_sounds, itv_hub, all_4, demand_5, youtube, matter(→smart_home)`.

Special cases:

- **YouTube** [O]: `loadApp(url, 'YouTube', 'NetTVSpecial', resolution)`;
  default URL `https://www.youtube.com/tv?launch=menu`; voice launches append
  `launch_tag=voice&vs=0&vq=<quality>`.
- **Disney+** [O]: Philips → `loadApp(url, 'disney'|'disney_deeplink',
  'Disney', resolution)`; Vestel → portaltv.tv swf wrapper.
- **DAZN** [O]: URL template `{TargetName}` replaced with `philips`.
- **Apple TV** [O]: URL normalized by `Fr()` before load.
- **free_channels** [O]: literally `window.open(url)`, a plain browser tab.
- **Games** [O]: `loadApp(url, name, app_type, '1080p' default)`.
- **Simple setup** [O]: `loadApp('https://<same-host>/simple-setup.html',
  'SimpleSetupMiddleware', 'NetTV', '720p')`.

## Where the app list comes from [O]

- Backend: `/me/apps`, `/apps/<id>`; favorites ordering via
  `/apps/update_positions` (PUT, `{app_id, position}` list; positions start at
  a random 0–4000 offset).
- Each item carries `deeplinkings: [{app:{id,code,name,icon,url,app_type,
  resolution,isFVPApp,provider}, url}]`. OK on a tile executes
  `deeplinkings[0]`; several deeplinkings render "Watch on X / More options".
- FVP/Freely inventory is cached in localStorage (`DEVICE_APPS`, via
  `getDeviceContent('fvp')`) and matched by `appTitle`. `_fvp_`-prefixed ids
  are FVP markers, excluded from position sync.
- The locally-installed probe `Tr()` also hardcodes `UKTV Play`.

## Payment IPC [O]

`set-options` action → `BrowserIpcPluginClass.setOptions(amount, options)`:
in-app purchases go through the browser plugin, not fetch.

Provenance: useCustomKeyDown-BWJfSd9U.js (`Nr`/`Ar` tables, launch handlers,
`Zr`/`Tr`/`wr`/`Dr`/`Or` helpers), main-CrBAgRaF.js (tile components calling
`ze(at.LAUNCH_APP, deeplinkings[0])`).
