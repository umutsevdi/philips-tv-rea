# 05. Ads and tracking

## Where ads appear [O]

- Home-screen hero banners: carousel, mini banner, screensaver full-bleed, all
  fed by the `banners` redux slice (`banners/fetchBanners` per list id).
- `side_promotion` list type; voucher campaigns (`voucher_campaign` target
  with a QR-code popup via `/me/voucher_assignments/assign`).
- Offline mode falls back to local banners (`/assets/imgs/offline/banners/*`).

## Banner supply chain [O]

Sources (`hb` enum): `INTERNAL`, `SPRINGSERVE` (image), `SPRINGSERVE_VIDEO`
(VAST), `EQUATIV_VIDEO` (VAST), `NETFLIX` (promo tiles).

- INTERNAL campaigns come from backend lists with `target_type`
  (app/channel/image/voucher), `deeplinking_url`, `clicktrackers`,
  `imptrackers`, `internal_name`, `campaignId`.
- SpringServe/Equativ: the page fetches VAST tags client-side and parses them
  into `{videoUrl, bannerImage, imptrackers, clicktrackers,
  tracking(quartiles)}`. Unparseable or imageless campaigns are rejected with
  a `[BANNER SUPPLY] rejected banner` warning. Trackers fire via
  `fetch(url, {mode:'no-cors'})`.
- Netflix tiles: fetched from a Netflix partner API with a tile cursor;
  clicks go through `jy({deepLinks:[...], source:'BANNER'})`, the Netflix
  certification flow.

## Tracking [O]

- `imptrackers` fire on impression (throttled), `clicktrackers` on click,
  quartile events for VAST video.
- First-party telemetry, event names end in `-titan`: `ad-display-titan`,
  `ad-click-titan`, `ad-video-qoe-titan`, `stream-qoe-titan`, `app-open-titan`,
  `launcher-open-titan`, `launcher-close-titan`, `launcher-search*`,
  `launcher-page-open-titan`, `launcher-deeplinkings-open-titan`,
  `launcher-add/remove-to-watchlist-titan`,
  `launcher-keyboard-visibility-titan`, `launcher-edit_favourite_apps-titan`,
  `launcher-account-*-titan`, `launcher-user-feedback-titan`,
  `satisfaction-survey-*`, `button_press`, `powerstate`,
  `internet_connection`.
- Payloads include `country: I.market()`, `language: I.locale()`,
  `launcher_version`, `firmware_version`, geo (country plus postalCode when
  consented), `launcher_session_id`, `app_session_id`, and consent-gated
  identifiers: `device_id` (raw UUID or hashed when consent is off),
  `consumer_id`, `ifa_id`, plus `legal_consents` and
  `legal_framework: 'GDPR'`.
- Ad click payloads embed `useragent`, `country`, `device_model`,
  `device_id: I.ifa()`, `device_id_type: I.ifaType`, `campaign_id/name`,
  `ad_type`, `ad_size: '1920x1080'`, `product: 'TitanOS'`.
- Error reporting: Rollbar SDK (`rollbar.occurrence`).

## Consent [O]

- CMP: `launchCMP()` opens the firmware consent page (`getCmpUrl()`). If the
  auth JWT already contains `consent_string` or `iab_tc`, the CMP is skipped.
- Banner URLs get `brand_name` and `gdpr_consent` query params appended.
- With feature opt-in `2`, telemetry sends raw `uuid`/`consumerId`/`ifa`;
  otherwise hashed or `'unknown'`.

## Device ad IDs [O]

- `WhaleAdID`: UUID created by zeasn_sdk.js, persisted in
  `localStorage.infoData.datas.whaleAdID`.
- `Product.ifa` + `Product.ifaType` (e.g. `dpid`), from the SDK docs.
- Device UUID (`getDeviceId` / JWT `device_uuid`).

## Block levers [O/I]

1. **DNS-block SpringServe/Equativ and tracker domains.** The launcher has
   fallback paths (rejected-banner warnings, offline banners, `showFallback`
   UI state), so it degrades to internal content [O].
2. **Block the telemetry endpoint.** Host not extracted yet (09, U3).
3. **Replacement page: render no banner lists.** Fetch only
   `apps_list`/`favorites_list` types. Internal campaign banners can also be
   filtered by source [I].
4. **Withdraw GDPR consent** in firmware settings. This should stop
   personalization fields; unpersonalized ads may still show [I].

Provenance: main-CrBAgRaF.js (banners slice, `hb` sources, supply functions,
tracker firing, telemetry payload builders, event-name enum, Rollbar),
zeasn_sdk.js (WhaleAdID), useCustomKeyDown-BWJfSd9U.js (`getCmpUrl`, consent
checks).
