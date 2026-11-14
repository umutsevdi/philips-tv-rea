/* Titan backend client (docs/04). Auth via the firmware-issued token;
   unauthenticated calls would only return the SPA shell. List filtering
   keeps banner/ad lists out entirely — the ad pipeline never runs. */

import { token } from '../bridge/device';

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

export interface Tile {
  id: string;
  name: string;
  brand?: string;           // brand slug (public/brands/<slug>.svg), 'ui', or lettermark key
  icon?: string;            // lucide icon name for utility tiles
  color?: string;           // lettermark plate color
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
const ALLOWED_LIST_TYPES = new Set([
  'apps_list', 'favorites_list',
  'top_movies_list', 'on_now_list', // the plan's two content rows
]);

function headers(tk: string): HeadersInit {
  return { Authorization: `Bearer ${tk}`, Accept: 'application/json' };
}

async function get<T>(path: string, tk: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_HOST}${path}`, { headers: headers(tk) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Full home payload: app rows + up to two content rows, or null when offline. */
export async function fetchHome(): Promise<PageList[] | null> {
  const tk = token();
  if (!tk) return null;
  const pages = await get<{ lists?: PageList[] }>('/me/pages', tk);
  if (!pages?.lists) return null;
  return pages.lists
    .filter((l) => ALLOWED_LIST_TYPES.has(l.type))
    .slice(0, 3);
}

/** The device's app list (docs/03 "Where the app list comes from"):
    /me/apps, one deeplinking per item. Response shape is inferred from the
    bundles (array or {apps:[...]}) — verify on-device (09/U4, U11). */
export async function fetchAppCatalog(): Promise<Tile[]> {
  const tk = token();
  if (!tk) return [];
  const res = await get<unknown>('/me/apps', tk);
  if (!res) return [];
  const items: ContentItem[] = Array.isArray(res)
    ? (res as ContentItem[])
    : Array.isArray((res as { apps?: ContentItem[] }).apps)
      ? (res as { apps: ContentItem[] }).apps
      : [];
  return items
    .filter((it) => it.deeplinkings?.length)
    .map((it) => ({
      id: it.id,
      name: it.title ?? 'App',
      launch: specFromDeeplink(it.deeplinkings![0]),
    }));
}

/** Convert a backend deeplinking to a launch spec (docs/03 dispatch order). */
export function specFromDeeplink(d: DeepLinking): LaunchSpec {
  const app = d.app;
  const code = app.code || app.name;
  if (code === 'netflix') return { kind: 'netflix', url: d.url };
  if (code === 'prime_video') return { kind: 'prime' };
  if (['bbc_iplayer', 'itv_hub', 'all_4', 'demand_5'].includes(code)
      && (app.isFVPApp || app.provider === 'freely')) {
    return { kind: 'fvp', url: d.url };
  }
  if (code === 'free_channels') return { kind: 'deeplink', url: d.url };
  return { kind: 'webapp', url: d.url, name: app.name || code,
           appType: app.app_type, resolution: app.resolution || '1080p' };
}
