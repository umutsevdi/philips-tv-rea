/* Central server configuration.

   ONE file, ONE source: ~/.config/philips-tv-rea/config.json (mode 0600).

     { "tv": { "host", "user", "password" },
       "nextcloud": { "base", "user", "app_password" } }

   No environment overrides, no legacy files: the file is the config.

   What is deliberately NOT here:
   - localStorage (pins, last focus, last Drive folder): per-device UI state,
     lives in the webview, never sent to the server.
   - tiles.json / catalog.json: build-time content (home tiles, app fallback
     catalog), shipped inside the bundle, not runtime configuration. */

import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface TvConfig { host: string; user: string; password: string }
export interface NextcloudConfig { base: string; user: string; password: string }

export interface AppConfig {
  tv: TvConfig | null;
  nextcloud: NextcloudConfig | null;
}

const CONFIG_DIR = join(homedir(), '.config', 'philips-tv-rea');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

type Raw = Record<string, unknown>;

function readJson(file: string): Raw | null {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Raw) : null;
  } catch { return null; }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length ? v : undefined;
}

function tvFrom(section: Raw | null | undefined): TvConfig | null {
  const host = str(section?.host);
  const user = str(section?.user);
  const password = str(section?.password);
  if (!host || !user || !password) return null;
  return { host, user, password };
}

function nextcloudFrom(section: Raw | null | undefined): NextcloudConfig | null {
  const base = (str(section?.base) ?? '').replace(/\/$/, '');
  const user = str(section?.user);
  const password = str(section?.app_password) ?? str(section?.password);
  if (!base || !user || !password) return null;
  return { base, user, password };
}

let cache: AppConfig | null = null;
let cacheStamp = '';

/** Config is re-read whenever the file changes on disk (mtime+size), so
    editing config.json takes effect without restarting the server. */
function stamp(): string {
  try {
    const s = statSync(CONFIG_FILE);
    return `${s.mtimeMs}:${s.size}`;
  } catch { return 'missing'; }
}

export function loadConfig(): AppConfig {
  const now = stamp();
  if (cache && now === cacheStamp) return cache;
  const raw = readJson(CONFIG_FILE) ?? {};
  cache = {
    tv: tvFrom(raw.tv as Raw | undefined),
    nextcloud: nextcloudFrom(raw.nextcloud as Raw | undefined),
  };
  cacheStamp = now;
  return cache;
}

export function invalidateConfig(): void { cache = null; }

/** Merge-write one section into config.json (0600). Other sections are
    preserved. */
export function saveSection(section: 'tv' | 'nextcloud', value: Raw): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const current = readJson(CONFIG_FILE) ?? {};
  const next = { ...current, [section]: { ...(current[section] as Raw | undefined), ...value } };
  writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
  chmodSync(CONFIG_FILE, 0o600);
  invalidateConfig();
}

export const configPaths = { dir: CONFIG_DIR, file: CONFIG_FILE };
