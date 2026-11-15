/* Nextcloud WebDAV passthrough. Credentials live in config.json (0600);
   the SPA only ever gets proxy-relative URLs and parsed JSON — no auth
   material crosses to the webview.

   Listing:  GET /api/nc/list?path=/          → NcEntry[]
   File:     GET /api/nc/file?path=…&w=&h=   → bytes (preview for images via
             /core/preview; raw + Range passthrough for video)

   The PROPFIND multistatus is parsed with fast-xml-parser using local-name
   matching (removeNSPrefix): real Nextcloud servers emit arbitrary
   namespace prefixes (d:, D:, oc:, unprefixed) — the previous prefix-
   sensitive regex parsing broke folder detection. */

import { request as undiciRequest } from 'undici';
import { XMLParser } from 'fast-xml-parser';
import { loadConfig } from './config';

export interface NcEntry {
  name: string; path: string; isDir: boolean;
  mime: string; size: number; mtime: string;
}

interface NcConfig { base: string; user: string; password: string }

export function loadNcConfig(): NcConfig | null {
  return loadConfig().nextcloud;
}

function authHeader(cfg: NcConfig): string {
  const token = Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64');
  return `Basic ${token}`;
}

function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/');
}

function davUrl(cfg: NcConfig, path: string): string {
  return `${cfg.base}/remote.php/dav/files/${encodeURIComponent(cfg.user)}${encodePath(path)}`;
}

/** Parser output is nested objects keyed by possibly-prefixed tags;
    removeNSPrefix already strips namespaces, so plain key access works.
    Single node or array → always an array. */
function asArray(v: unknown): Record<string, unknown>[] {
  if (v === undefined || v === null) return [];
  return (Array.isArray(v) ? v : [v]) as Record<string, unknown>[];
}

function parsePropfind(xml: string, parent: string, user: string): NcEntry[] {
  const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });
  const tree = parser.parse(xml) as { multistatus?: { response?: unknown } };
  const out: NcEntry[] = [];
  const parentNorm = parent.replace(/\/+$/, '') || '/';
  for (const resp of asArray(tree.multistatus?.response)) {
    // skip propstat blocks that report 404 (partial property responses)
    const propstats = asArray(resp.propstat).filter(
      (ps) => !/404/.test(String(ps.status ?? '')));
    const prop = propstats.map((ps) => ps.prop).find(Boolean) as
      Record<string, unknown> | undefined;
    if (!prop) continue;
    const href = String(resp.href ?? '');
    /* resourcetype nests the collection marker: <resourcetype><collection/>.
       Self-closing (plain files) parses to an empty string — guard. */
    const rt = prop.resourcetype;
    const isDir = rt !== null && typeof rt === 'object' && 'collection' in rt;
    const mime = String(prop.getcontenttype ?? '');
    const size = parseInt(String(prop.getcontentlength ?? '0'), 10) || 0;
    const mtime = String(prop.getlastmodified ?? prop.lastmodified ?? '');

    const prefix = `/remote.php/dav/files/${user}`;
    let rel = decodeURIComponent(href.startsWith(prefix) ? href.slice(prefix.length) : href);
    rel = `/${rel.replace(/^\/+|\/+$/g, '')}`;   // normalize to leading-slash, no trailing
    if (rel === '/') continue;                   // the server root itself
    if (rel === parentNorm) continue;            // the requested directory (depth-1 includes it)
    const name = rel.split('/').pop() ?? rel;
    out.push({ name, path: rel, isDir, mime, size, mtime });
  }
  out.sort((a, b) => (a.isDir === b.isDir
    ? a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    : a.isDir ? -1 : 1));
  return out;
}

export async function ncList(path: string): Promise<NcEntry[]> {
  const cfg = loadNcConfig();
  if (!cfg) throw Object.assign(new Error('Nextcloud not configured'), { ncStatus: 503 });
  const res = await undiciRequest(davUrl(cfg, path), {
    method: 'PROPFIND',
    headers: { Authorization: authHeader(cfg), Depth: '1' },
    bodyTimeout: 15_000, headersTimeout: 15_000,
  });
  if (res.statusCode >= 400) {
    res.body.destroy();
    throw Object.assign(new Error(`Nextcloud returned ${res.statusCode}`), { ncStatus: res.statusCode });
  }
  const xml = await res.body.text();
  return parsePropfind(xml, path, cfg.user);
}

/** File stream: server-resized preview (w/h) or raw with Range passthrough.

    Preview endpoint: `/core/preview.png?file=<path relative to the user's
    files>&x&y&a&mode`. NOT `/core/preview` — that route takes a numeric
    fileId (and fileId=-1 always 404s). `a=1` crops to fill (grid thumbs),
    `a=0` preserves aspect (full-screen viewer). forceIcon=0 keeps failures
    honest (404 → the client falls back to the raw file / a plate). */
export async function ncFile(path: string, w?: number, h?: number,
                             range?: string, crop = false) {
  const cfg = loadNcConfig();
  if (!cfg) throw Object.assign(new Error('Nextcloud not configured'), { ncStatus: 503 });
  let url: string;
  if (w && h) {
    const rel = path.replace(/^\/+/, '');   // userFolder->get() wants a relative path
    const q = new URLSearchParams({
      file: rel,
      x: String(w),
      y: String(h),
      a: crop ? '1' : '0',
      mode: crop ? 'cover' : 'fill',
      forceIcon: '0',
    });
    url = `${cfg.base}/core/preview.png?${q.toString()}`;
  } else {
    url = davUrl(cfg, path);
  }
  const headers: Record<string, string> = { Authorization: authHeader(cfg) };
  if (range && !w) headers.Range = range;
  return undiciRequest(url, { headers, bodyTimeout: 60_000, headersTimeout: 15_000 });
}
