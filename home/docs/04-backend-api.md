# 04. Backend API

## Hosts [O]

- Production API: `https://eu.app.titanos.tv` (default when `getEnvUrl` is
  absent; otherwise `https://${window.getEnvUrl()}`).
- Other envs in the bundles: `dev01.titanos.tv`, `cert03.titanos.tv`,
  `app.dev03.titanos.tv` (mock images).
- Frontend origin: `app.titanos.tv`, CloudFront in front of nginx/1.31.8.
- Host parsing: `eu.dev01.titanos.tv`-style hosts map to env `dev01`;
  `prod`/`stg`/`acc`→`stg`, `cert`→`stg`, `dev`/`qa`→`dev`.

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
  pagination. BBC iPlayer, Channel4 (`fvc-webapp`) and UKTV links are
  hardcoded legacy content sources.

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

## The API is device-gated [O]

Unauthenticated requests to `/me/pages` return the SPA HTML, not JSON. The API
needs the firmware-issued auth header, so it cannot be driven from a laptop
without a token. The header name is not extracted yet (09, U4).

## QA and environments [O]

- `getEnvUrl()` overrides the API host when the firmware provides it.
- The QA combo sets the `_qa_env_enabled_` storage marker; what it unlocks
  beyond dev modals is unknown (09, U6).

Provenance: endpoints-BXY-ZF0n.js (error class, payments routes, zod schemas),
useCustomKeyDown-BWJfSd9U.js (`getApiEnv`, env parsing, `getToken` call sites),
main-CrBAgRaF.js (redux slices, list-type enum, supply pipeline), index.html
(referrer comment), curl probes.
