# 04. Backend API

## Hosts [O]

- Production API: `https://eu.app.titanos.tv` (default when `getEnvUrl` is
  absent; otherwise `https://${window.getEnvUrl()}`).
- Other envs in the bundles: `dev01.titanos.tv`, `cert03.titanos.tv`,
  `app.dev03.titanos.tv` (mock images). `dev01` also serves production
  artwork (`:443/img/…` icon URLs throughout the mock catalog).
- Frontend origin: `app.titanos.tv`, CloudFront in front of nginx/1.31.8.
- Host parsing: `eu.dev01.titanos.tv`-style hosts map to env `dev01`;
  `prod`/`stg`/`acc`→`stg`, `cert`→`stg`, `dev`/`qa`→`dev`.
- Account portal: `my.titanos.tv` (production) and per-env variants
  `my.stg01.eu.stg.titanos.tv`, `my.acc01.eu.stg.titanos.tv`,
  `my.dev01.eu.dev.titanos.tv`.
- Regional split: the launcher picks `eu.app.titanos.tv` from the device's
  market (docs/06 resolution chain); the `eu.` prefix is the Europe data
  residency region. A LATAM TV would route elsewhere.
- Zeasn (SDK vendor, Whale browser): `smarttv.zeasn.tv` and
  `dev-smarttv.zeasn.tv` — JSONP device-info call including the WhaleAdID
  (lib/zeasn_sdk.js). DNS-blockable; the launcher degrades gracefully.

## Authentication [O/I]

- The firmware opens the page with a multi-KB auth token in the URL query
  (index.html comment about Referer size) [O].
- `window.getToken()` / `refreshToken()` are the page-side API [O]; the token
  is a JWT (`exp` parsing seen) [I].
- The client `h_({endpoint, method, queryParams, data, withAuthHeader,
  origin})` wraps fetch; failures split into `network` vs `server`; critical
  failures escalate to `CriticalApiError` [O].
- Sign-up/sign-in runs on every launch and retries later if it fails [O].

## Endpoints seen [O]

Content and launcher (mostly under `/me/`):

- `/me/pages`, `/me/menu`, `/me/apps`, `/apps/<id>`,
  `/apps/update_positions` (PUT), `/me/apps` POST/DELETE (favorites),
  `/me/watchlists` (+`/check`), `/me/voucher_assignments/assign` (POST),
  `/payments/subscription_offers`, `/payments/subscriptions`
  (+cancel/reactivate).
- List types: `banner_list, apps_list, favorites_list, top_movies_list,
  dazn_list, rakuten_tv_list, netflix_list, prime_video_list, disney_list,
  youtube_list, freeview_list, bbc_list, itvhub_list, all4_list, my5_list,
  on_now_list, freely_list, fvp_channel_list, chili_list, max_list,
  hbomax_list, plex_list, tubi_list, joyn_de_list, joyn_at_list,
  movistar_list, my_canal_list, avod_genre_list, sports_events_list,
  game_list, side_promotion, ...`.
- Netflix promo tiles come from a Netflix partner endpoint with tile-cursor
  pagination (hosts `tpv-9f113d55.prod.partner.netflix.net`,
  `vestel-8b36d4fe.prod.partner.netflix.net`). BBC iPlayer, Channel4
  (`fvc-webapp`) and UKTV links are hardcoded legacy content sources.
- EPG: `GET /epg/<channelId>?date=<utc-date>&hour=<utc-hour>` per channel;
  `GET /epg?drm=true&date=<utc-date>&hour=<utc-hour>&genre=<g>&page=<n>
  &per_page=50` across channels (paged via `total_pages`). Returns channel
  timelines whose entries carry `start_time`/`end_time` + content. This is
  what populates the stock launcher's "on now" data. Date/hour are UTC,
  hour floored to the current hour.

## Content item shape (relevant subset) [O]

```
{
  id, type: movie|tv_show|season|episode|channel|channel_program|
            sport_program|game|genre|app|image|voucher_campaign,
  title, synopsis, genres, year, ratings,
  images: {artwork_landscape, artwork_portrait, icon_landscape, ...},
  deeplinkings: [{app:{...}, url}],
  target_id, target_type, call_to_action, deeplinking_url,   (banners)
  clicktrackers, imptrackers, internal_name                  (banners)
}
```

Client-side post-processing pipeline (`ote`): strips Apple TV deeplinks, drops
Apple-TV-only items, drops empty details, drops Apple TV banners, decrements
search totals.

## App catalog endpoint [O] (extracted 2026-11-15)

`apps_list` rows resolve to `GET /apps?deviceModel=<model>` (rule table in
main-CrBAgRaF.js). Response: array (or `{apps:[…]}`) of app objects:

```
{ id, code, name, icon: <Titan CDN URL>, url,
  app_type, resolution, isFVPApp, provider }
```

`url` may be a plain https URL or a `localfunction:…` deeplink
(`gotonetflix`, `gotoaiv`, `GotoFVPApp:Name:https://…`). The embedded mock
catalog carries real icon URLs, e.g.
`https://dev01.titanos.tv:443/img/kgcq59mnxsiznbe25ujicah04eqq` (Netflix).

Launch dispatch per code (useCustomKeyDown `Ar`/`Nr`, verbatim):

| code | dispatch |
|---|---|
| netflix | `GotoNetflix(url, source)` |
| youtube | `loadApp(url‖youtube.com/tv?launch=menu, 'YouTube', 'NetTVSpecial', res‖720p)` |
| dazn | `loadApp(url.replace('{TargetName}','philips'), …)` |
| disney | `loadApp(url, disney‖disney_deeplink, 'Disney', res‖1080p)` |
| prime_video / localfunction:gotoaiv | `GotoAIV(url, 'PrimeVideo')` |
| appletv | URL + `titandata=` LZ-compressed device blob |
| FVP (isFVPApp/provider freely/GotoFVPApp:) | `GotoFVPApp(url, name)` |
| linear tune | `window.TuneToListedChannel(number, invokeMethod)` |
| free_channels | `window.open(url)` |
| media/ga/alexa/play_fi/freely/matter | `loadLocalUI(...)` |

## The API is device-gated [O]

Unauthenticated requests to `/me/pages` return the SPA HTML, not JSON (same
for a bogus Bearer token — verified by curl probe 2026-11-15: `200
text/html`, never a 401). The API needs the firmware-issued auth header
(format: 09, U4 — solved). It cannot be driven from a laptop without
capturing a token off the TV; passive router sniffing cannot capture it
because the token only ever crosses the network inside TLS. The capture
route is the DNS override of `app.titanos.tv` (U2): the boot URL's `?jwt=`
param then lands on your own server in the clear.

## QA and environments [O]

- `getEnvUrl()` overrides the API host when the firmware provides it.
- The QA combo sets the `_qa_env_enabled_` storage marker; what it unlocks
  beyond dev modals is unknown (09, U6).

Provenance: endpoints-BXY-ZF0n.js (error class, payments routes, zod schemas),
useCustomKeyDown-BWJfSd9U.js (`getApiEnv`, env parsing, `getToken` call sites),
main-CrBAgRaF.js (redux slices, list-type enum, supply pipeline), index.html
(referrer comment), curl probes.
