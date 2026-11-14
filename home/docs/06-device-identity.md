# 06. Device identity and locale

## Country resolution chain (Philips class) [O]

```
market():
  window.getCountry() if present, lowercased
  else URL ?country= param, kept in sync with localStorage MARKET
  else 'gb'
brand():
  JWT claim `brand` or getPlatformConfig(BRAND), fallback 'unset'
locale():
  platformConfig(LANGUAGE) or per-market default language map
cluster():
  UA regex /TV_[A-Z0-9_]+/ → tr map → TPN256E/TPN257E/TPN258E
firmwareVersion():
  window.getSWVersion() ?? JWT `firmware` ?? platformConfig VERSION
modelYear():
  window.getModelYear()
model():
  JWT `brand_model` ?? getDeviceModel()
```

Vestel/JVC class: country and language come from the OIPF configuration
(`countryId`, `preferredUILanguage`), the serial from `localSystem` [O].

## Zeasn SDK (lib/zeasn_sdk.js) [O]

Unminified. Fills `window.DeviceInfo`:

- Resolution order: localStorage `infoData` cache → cookies → JSONP to
  `smarttv.zeasn.tv/homepage_api/device/clientInfo`.
- Brand from UA: `aoc`/`philips` → vendor and brand; `tcl`/`tbrowser` → TCL,
  with platform sniffing (`MS6586`, `MS6488`, `NT563`, `MT5655`).
- `checkTPVCookies(data)`: firmware version (`ufversion`), country, mac;
  `profileid` → parses the CTN to derive the TV model year
  (`year = 2017 + digit - 2`) and platform string.
- WhaleAdID: random UUID, created once, persisted in `infoData`.
- Capabilities via `SmartTvA_API.hasCapability(...)`: 3D, UHD, HDR10/DV,
  PlayReady/Widevine DRM, TTML subtitles, multiaudio, color keys.
- OS guess: UA contains `android`/`andr0id` → Android, else Linux; engine
  `mozilla` → Blink, `presto` → Presto.

## Platform configs [O]

- Per-model feature JSON in the keydown bundle, e.g. `airPlayModels`:
  `{"65MLED920/10": {supports:[{from:'167.001.226.121'}]}, ...,
  "65PUS7001/10": {}}`: features gated by model and firmware-from-version.
- Page-size configs (`home:'small'`, `avod:'big'`, ...) and feature flags
  (`accounts:true, fullscreenFavRow:false, paymentMethod:false,
  subscriptions:false`).
- Freely (UK): `freelyMode()` B2C/B2B; `isFreelyS2SDevice()` = modelYear ≥ 2026
  or B2B mode; GB-only gating.

## Consequences [I]

- The backend gets `country + language + model + year + cluster + consent`
  from the device itself. Locale-targeted ads follow the TV's configured
  country, not IP geolocation at request time.
- `?country=xx` works for testing only when `getCountry` is absent; on-device
  the firmware function wins.

Provenance: useCustomKeyDown-BWJfSd9U.js (resolution chains, `nr`/`tr` UA map,
airPlayModels JSON, freely flags), zeasn_sdk.js, docs.titanos.tv SDK reference.
