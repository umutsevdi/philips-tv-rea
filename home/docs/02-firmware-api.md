# 02. Firmware API: the window dialect

The launcher does what a normal website cannot through objects and functions
the firmware injects into `window` [O]. This is the complete inventory found
in useCustomKeyDown-BWJfSd9U.js and index.html.

## Launch bridges [O]

| API | Purpose | Notes |
|---|---|---|
| `window.loadApp(url, name, app_type, resolution)` | Launch any hosted webapp | Generic fallback for most apps |
| `window.loadLocalUI(id)` | Open native firmware screen | `settings`, `sources`, `epg`, `media`, `connect`, `channels`, `canali`, `ga`, `alexa`, `freely`, `play_fi`, smart home, `browser`, `btWizard`, `demome`, update wizard |
| `window.ApplicationController.launchApplication(urlOrId, flag)` | Legacy/FVP app manager | Flags seen: 0 (UI), 1 (resource), 2 (FVP/AIT), 3 (HD+), 4 (onetrust) |
| `window.GotoNetflix(url, source)` | Netflix bridge | Certified integration |
| `window.GotoAIV` | Prime Video (AIV = Amazon Instant Video) | |
| `window.GotoOpenInternet` | Open browser app | |
| `window.GotoFVPApp` / `window.GotoFVPProgram` | Freeview Play apps/programs | |
| `window.BrowserIpcPluginClass.setOptions(amount, options)` | NPAPI plugin, `type="application/browser-ipc-2"` | Payment dialogs; the object tag sits in the HTML head so the plugin loads |

## Device info and platform [O]

| API | Purpose |
|---|---|
| `getToken()` / `refreshToken()` | Backend auth token (multi-KB, also delivered via URL) |
| `getCountry()` | Device country setting |
| `getLanguage()` | Device language |
| `getDeviceId()` | Device UUID |
| `getDeviceModel()` | e.g. `55OLED811/05` |
| `getModelYear()` | e.g. 2025 |
| `getSWVersion()` | Firmware version, e.g. `058.002.179.041` |
| `getEnvUrl()` | API environment host override (QA) |
| `getPlatformConfig()` | Platform config blob |
| `getAit(url, referrer, isTemplate, cb)` | AIT deeplink for FVP apps (DVB AppInfo Table) |
| `getFreelyData()` | Freely (UK) platform data |
| `getNetflixInfo()` | Netflix integration info |
| `requestPrimeRecommendations(...)` | Prime Video recommendation API |
| `getConnectedSourceList()` | HDMI/input sources |
| `getCmpUrl()` | Consent page URL |
| `getScreenSaverOptions()` | Screensaver config |
| `getDeviceContent(...)` | Device-side content lists (FVP app inventory) |

## Events and misc [O]

- `NetworkBandwidthFromPlatform` DOM event,
  `notifyPlatformUpdateNetworkSpeed(...)`
- `NotifyLauncherVersion(version)` on load
- `offline` / `onlineStateChanged` DOM events (offline banner)
- Screensaver toggle callback (`onScreensaverToggle`)
- `getSWVersion()` mirrored in `localStorage['ufversion']`

## Keycodes [O] (Philips class, `lr` keymap)

| Action | keydown codes |
|---|---|
| back | `461` |
| backspace | `Backspace`, `8` |
| left/right/up/down | `ArrowLeft/Right/Up/Down`, `37/39/38/40` |
| enter | `Enter`, `13` |
| red | `Red`, `403`, `112` |
| green | `Green`, `113` |
| yellow | `Yellow`, `405`, `114` |
| blue | `Blue`, `406`, `115` |
| channel up/down | `PageUp`/`PageDown`, `402`/`401` |

401–406 are the HbbTV/Vewd color and channel keys; 461 is the Vewd back key.
A replacement page must listen for these, not browser defaults [I].

Hidden QA combos [O]: `left`×4 (all actions), `right`×3 (launcher info),
`up down up down` (on-screen logs), `down up down up` (player debug),
`left right left right` (QA mode; writes `_qa_env_enabled_` to storage).

## Brand device classes [O]

- `B` (Philips/JVC/Titan base): all bridges above, keymap as listed.
- `ia` (Vestel-built JVC): different stack. Country and language come from the
  OIPF configuration (`countryId`, `preferredUILanguage`); launching goes
  through `ApplicationController.launchApplication(url, 1)`; legacy Flash-era
  portals: `http://www.portaltv.tv/swf/{disneyplus|youtube|amazon}/....swf`
  deeplink URLs.
- `clusterFromUserAgent()`: regex `/TV_[A-Z0-9_]+/` maps model to platform:
  `TV_NT72690_2025_2K → TPN257E`, `TV_NT72690_2025_4K → TPN256E`,
  `TV_NT72676_2025 → TPN258E`.
- zeasn_sdk.js fills `window.DeviceInfo` from UA, cookies, and a JSONP call to
  `smarttv.zeasn.tv/homepage_api/device/clientInfo`; brand sniffed from UA
  (philips/aoc/tcl/tbrowser); WhaleAdID persisted in `localStorage.infoData`.

Provenance: useCustomKeyDown-BWJfSd9U.js (device classes, keymap `lr`, QA
sequences, `checkWindowApi`/`window.*` call sites), index.html
(BrowserIpcPluginClass object tag, NotifyLauncherVersion), zeasn_sdk.js.
