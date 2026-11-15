/* Titan backend client (docs/04). Auth via the firmware-issued token;
   unauthenticated calls would only return the SPA shell. List filtering
   keeps banner/ad lists out entirely — the ad pipeline never runs. */

import { token, deviceJwt, rememberTokens, country, language, deviceInfo } from '../bridge/device';

export interface DeepLinkApp {
  id: string; code: string; name: string; icon: string; url: string;
  app_type: string; resolution: string; isFVPApp: boolean; provider?: string;
}

export interface DeepLinking { app: DeepLinkApp; url: string }

export interface ContentItem {
  id: string;
  type: string;
  title?: string;
  synopsis?: string;
  images?: Record<string, string>;
  deeplinkings?: DeepLinking[];
  call_to_action?: string;
  target_id?: string;
  target_type?: string;
  deeplinking_url?: string;
}

export interface PageList {
  id: string;
  type: string;              // list type enum from docs/04
  title?: string;
  items?: ContentItem[];
}

/** App object as returned by GET /apps (and the embedded mock catalog):
    icon is a Titan CDN URL, url may be a plain https URL or a
    localfunction:… deeplink. */
export interface BackendApp {
  id?: number | string;
  code?: string;
  name?: string;
  icon?: string;
  url?: string;
  app_type?: string;
  resolution?: string;
  isFVPApp?: boolean;
  provider?: string;
}

export interface Tile {
  id: string;
  name: string;
  brand?: string;           // committed brand slug (public/brands/<slug>.svg), or 'ui' for utility tiles
  icon?: string;            // lucide icon name for 'ui' tiles
  color?: string;           // unused by rendering (art.ts generates hue); kept for config compat
  iconUrl?: string;         // backend CDN icon URL (GET /apps `icon` field)
  launch: LaunchSpec;
}

export type LaunchSpec =
  | { kind: 'broadcast' }
  | { kind: 'local-ui'; uiId: string }
  | { kind: 'webapp'; url: string; name: string; appType: string; resolution: string }
  | { kind: 'netflix'; url?: string }
  | { kind: 'prime' }
  | { kind: 'fvp'; url: string }
  | { kind: 'deeplink'; url: string };

const API_HOST = 'https://eu.app.titanos.tv';
const REQUEST_TIMEOUT_MS = 4000;

/** UTC date + hour window the EPG endpoint expects (jv() helper in the
    stock bundle: current UTC date, floored to the hour). */
function epgWindow(): { date: string; hour: number } {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const hour = now.getUTCHours();
  return { date, hour };
}
const ALLOWED_LIST_TYPES = new Set([
  'apps_list', 'favorites_list',
  'top_movies_list', 'on_now_list', // the plan's two content rows
]);

/* Common query params every stock request appends (h_ builder, extracted
   from main-CrBAgRaF.js): market/device/locale/firmware. */
function commonParams(): Record<string, string> {
  return {
    market: country(),
    device: 'tv',
    locale: language(),
    firmware: deviceInfo().sw,
  };
}

function withParams(path: string, extra?: Record<string, string>): string {
  const q = new URLSearchParams({ ...commonParams(), ...extra });
  return `${path}?${q.toString()}`;
}

/** One authenticated GET. Returns the parsed body and any rotated token
    (responses carry the successor JWT in the `authorization` header — the
    stock client stores it and uses it on later calls). */
async function get<T>(path: string, tk: string): Promise<{ data: T | null; rotated: string | null }> {
  try {
    /* Abort after a bounded wait so an unreachable host can't stall boot;
       engines without AbortController just lose the timeout (old Blink). */
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS) : null;
    try {
      const res = await fetch(`${API_HOST}${path}`, {
        headers: { Authorization: `Bearer ${tk}`, Accept: 'application/json' },
        signal: ctrl?.signal,
      });
      const rotated = res.headers.get('authorization');
      if (!res.ok) return { data: null, rotated };
      return { data: (await res.json()) as T, rotated };
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    return { data: null, rotated: null };
  }
}

/** Pick the freshest token: window.getToken() first, then the last API
    rotation, then the device JWT (?jwt= URL param / device_auth_token). */
function bestToken(): string | null {
  return token() ?? deviceJwt();
}

/** Full home payload: app rows + up to two content rows, or null when offline. */
export async function fetchHome(): Promise<PageList[] | null> {
  const tk = bestToken();
  if (!tk) return null;
  const { data: pages } = await get<{ lists?: PageList[] }>(withParams('/me/pages'), tk);
  if (!pages?.lists) return null;
  return pages.lists
    .filter((l) => ALLOWED_LIST_TYPES.has(l.type))
    .slice(0, 3);
}

/** The device's app list. apps_list rows resolve to GET /apps?deviceModel=
    <model> (rule table in main-CrBAgRaF.js). Each item is an app object
    (id, code, name, icon CDN URL, url, app_type, resolution, isFVPApp),
    not a content item — shape confirmed in the 1.241.1 bundles. */
export async function fetchAppCatalog(): Promise<Tile[]> {
  const tk = bestToken();
  if (!tk) return [];
  const { data, rotated } = await get<unknown>(
    withParams('/apps', { deviceModel: deviceInfo().model }), tk);
  rememberTokens(rotated);
  const items: BackendApp[] = Array.isArray(data)
    ? (data as BackendApp[])
    : Array.isArray((data as { apps?: BackendApp[] })?.apps)
      ? (data as { apps: BackendApp[] }).apps
      : [];
  return items.filter((it) => it.url || it.code).map((it) => ({
    id: String(it.id ?? it.code),
    name: it.name ?? 'App',
    brand: it.icon ? undefined : (it.code as string | undefined),
    iconUrl: it.icon,
    launch: specFromBackendApp(it),
  }));
}

/** Convert a backend app to a launch spec, mirroring the stock dispatch
    (useCustomKeyDown Ar/Nr tables, extracted verbatim 2026-11-15):
    - DAZN rewrites {TargetName} → philips;
    - YouTube defaults to youtube.com/tv?launch=menu, NetTVSpecial, 720p;
    - Disney loads with app_type Disney ('disney_deeplink' when the URL is
      an http deeplink);
    - localfunction:gotoaiv → the Prime bridge;
    - FVP (isFVPApp / provider freely / localfunction:GotoFVPApp:) → FVP chain;
    - everything else → generic loadApp. */
export function specFromBackendApp(a: BackendApp): LaunchSpec {
  const code = a.code ?? '';
  const url = a.url ?? '';
  const res = a.resolution || '1080p';
  const name = a.name ?? code;
  if (url.startsWith('localfunction:gotoaiv')) return { kind: 'prime' };
  if (code === 'netflix' || url.startsWith('localfunction:gotonetflix'))
    return { kind: 'netflix', url: url.startsWith('http') ? url : undefined };
  if (code === 'dazn' && url.includes('{TargetName}'))
    return { kind: 'webapp', url: url.replace('{TargetName}', 'philips'), name, appType: a.app_type ?? 'NetTV', resolution: res };
  if (code === 'youtube')
    return { kind: 'webapp', url: url || 'https://www.youtube.com/tv?launch=menu', name: 'YouTube', appType: 'NetTVSpecial', resolution: a.resolution || '720p' };
  if (code === 'disney')
    return { kind: 'webapp', url, name, appType: 'Disney', resolution: res };
  const fvpMarker = url.startsWith('localfunction:GotoFVPApp:') || a.isFVPApp || a.provider === 'freely';
  if (fvpMarker) {
    // 'localfunction:GotoFVPApp:All4 Player:https://…' → the https URL payload
    const payload = url.startsWith('localfunction:GotoFVPApp:')
      ? url.split(':').slice(3).join(':') : url;
    return { kind: 'fvp', url: payload.startsWith('http') ? payload : url };
  }
  if (url.startsWith('http')) return { kind: 'webapp', url, name, appType: a.app_type ?? 'NetTV', resolution: res };
  return { kind: 'deeplink', url };
}

/** EPG "On now": what is actually airing across channels right now.
    GET /epg?drm=true&date=<utc date>&hour=<utc hour>&per_page=50 — the
    same call the stock launcher's fetchGenreEpg makes before genre
    filtering. Returns content items with channel_program/episode shapes
    whose timelines overlap "now". */
export async function fetchOnNow(): Promise<PageList[]> {
  const tk = bestToken();
  if (!tk) return [];
  const { date, hour } = epgWindow();
  const { data, rotated } = await get<unknown>(
    withParams('/epg', { drm: 'true', date, hour: String(hour), per_page: '50' }), tk);
  rememberTokens(rotated);
  if (!data) return [];
  const list = Array.isArray(data)
    ? (data as unknown[])
    : Array.isArray((data as { collection?: unknown[] }).collection)
      ? (data as { collection: unknown[] }).collection
      : [];
  const items: ContentItem[] = list
    .filter((it): it is ContentItem => typeof (it as ContentItem)?.id === 'string' || typeof (it as ContentItem)?.title === 'string')
    .slice(0, 20);
  return items.length ? [{ id: 'on-now', type: 'on_now_list', title: 'On now', items }] : [];
}

/** Convert a backend deeplinking to a launch spec (docs/03 dispatch order). */
export function specFromDeeplink(d: DeepLinking): LaunchSpec {
  const app = d.app;
  const code = app.code || app.name;
  if (code === 'prime_video') return { kind: 'prime' };
  if (['bbc_iplayer', 'itv_hub', 'all_4', 'demand_5'].includes(code)
      && (app.isFVPApp || app.provider === 'freely')) {
    return { kind: 'fvp', url: d.url };
  }
  if (code === 'free_channels') return { kind: 'deeplink', url: d.url };
  if (code === 'netflix') return { kind: 'netflix', url: d.url };
  return specFromBackendApp({ ...app, url: d.url || app.url });
}
