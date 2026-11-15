/* Nextcloud client via this app's WebDAV routes (src/routes/api/nc/*).
   Credentials live server-side (config.json, 0600); the SPA only ever sees
   proxy-relative URLs, so no auth material reaches the webview (plan R7).

   Listing:  GET /api/nc/list?path=/          → NcEntry[]
   File:     GET /api/nc/file?path=…&w=&h=   → bytes (preview for images via
             /core/preview; raw + Range passthrough for video)

   All fetches are bounded (4 s abort) so an unreachable proxy can't stall
   the boot path; listings are cached per path for the session. */

export interface NcEntry {
  name: string;
  path: string;      // absolute within the WebDAV root, e.g. /Photos/2024
  isDir: boolean;
  mime: string;
  size: number;
  mtime: string;
}

const REQUEST_TIMEOUT_MS = 4000;
const ROOT = '/';           // start at the WebDAV root
const LAST_PATH_KEY = 'launcher.nc.lastpath';

export const ncRoot = (): string => ROOT;

/** Last folder the user was browsing — restored on reopen. Client-side
    localStorage: it is a UI preference, not a secret. */
export function ncLastPath(): string | null {
  try {
    const v = localStorage.getItem(LAST_PATH_KEY);
    return v && v.startsWith('/') ? v : null;
  } catch { return null; }
}

function rememberPath(path: string): void {
  try { localStorage.setItem(LAST_PATH_KEY, path); } catch { /* storage full */ }
}

export function ncParent(path: string): string | null {
  if (path === ROOT || path === '/' || !path) return null;
  const idx = path.lastIndexOf('/');
  return idx <= 0 ? '/' : path.slice(0, idx);
}

/** Proxy-relative media URL. w/h trigger the server-resized preview
    (images); omit both for raw streaming (video). */
export function ncMediaUrl(path: string, w?: number, h?: number, crop = false): string {
  const q = new URLSearchParams({ path });
  if (w && h) {
    q.set('w', String(w));
    q.set('h', String(h));
    if (crop) q.set('crop', '1');
  }
  return `/api/nc/file?${q.toString()}`;
}

export function isImageEntry(e: NcEntry): boolean {
  return /^image\//.test(e.mime) || /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i.test(e.name);
}

export function isVideoEntry(e: NcEntry): boolean {
  return /^video\//.test(e.mime) || /\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(e.name);
}

export interface NcListResult {
  entries: NcEntry[] | null;   // null = transport/server failure
  authFailed: boolean;         // 401: bad app password
  notConfigured: boolean;      // 503: server started without Nextcloud config
  notFound: boolean;           // 404: folder gone (stale remembered path)
  rateLimited: boolean;        // 429: Nextcloud brute-force protection tripped
}

const listCache = new Map<string, NcListResult>();

export async function ncList(path: string): Promise<NcListResult> {
  const cached = listCache.get(path);
  if (cached) return cached;
  let result: NcListResult;
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS) : null;
    try {
      const res = await fetch(`/api/nc/list?path=${encodeURIComponent(path)}`,
        { signal: ctrl?.signal });
      if (res.ok) {
        const entries = (await res.json()) as NcEntry[];
        result = { entries, authFailed: false, notConfigured: false, notFound: false, rateLimited: false };
      } else {
        const body = await res.json().catch(() => ({}) as { auth?: boolean });
        result = {
          entries: null,
          authFailed: res.status === 401 || body.auth === true,
          notConfigured: res.status === 503,
          notFound: res.status === 404,
          rateLimited: res.status === 429,
        };
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    result = { entries: null, authFailed: false, notConfigured: false, notFound: false, rateLimited: false };
  }
  if (result.entries) {
    listCache.set(path, result);
    rememberPath(path);   // last folder seen — restored on next open
  }
  return result;
}

/** Image entries only, in grid order — the viewer walks this list. */
export function imagesOf(entries: NcEntry[]): NcEntry[] {
  return entries.filter((e) => !e.isDir && isImageEntry(e));
}

export function videosOf(entries: NcEntry[]): NcEntry[] {
  return entries.filter((e) => !e.isDir && isVideoEntry(e));
}
