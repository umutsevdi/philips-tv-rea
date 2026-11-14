/* Typed wrappers over the firmware-injected window dialect (docs/02).
   Every call is optionally guarded; when the firmware API is absent
   (desktop dev, or U1 origin-gating unresolved) a mock answers instead
   so the whole app runs in a laptop browser. */

export type AppType = string; // 'NetTV' | 'NetTVSpecial' | 'Disney' | 'Game' | ...

interface TitanWindow {
  loadApp?: (url: string, name: string, appType: string, resolution: string) => void;
  loadLocalUI?: (id: string) => void;
  ApplicationController?: { launchApplication: (urlOrId: string, flag: number) => void };
  GotoNetflix?: (url: string, source: string) => void;
  GotoAIV?: () => void;
  GotoOpenInternet?: () => void;
  GotoFVPApp?: (url: string) => void;
  GotoFVPProgram?: (url: string) => void;
  getAit?: (url: string, referrer: string, isTemplate: boolean, cb: (deeplink: string) => void) => void;
  getToken?: () => string;
  refreshToken?: () => string;
  getCountry?: () => string;
  getLanguage?: () => string;
  getDeviceId?: () => string;
  getDeviceModel?: () => string;
  getModelYear?: () => string;
  getSWVersion?: () => string;
  getPlatformConfig?: () => Record<string, unknown>;
  getConnectedSourceList?: () => unknown;
  NotifyLauncherVersion?: (version: string) => void;
}

declare global {
  interface Window { __titan?: TitanWindow }
}

const w = (typeof window !== 'undefined' ? window : {}) as unknown as TitanWindow;

const mocks: TitanWindow = {
  loadApp: (url, name) => console.info(`[mock] loadApp(${url}, ${name})`),
  loadLocalUI: (id) => console.info(`[mock] loadLocalUI(${id})`),
  ApplicationController: {
    launchApplication: (x, flag) => console.info(`[mock] launchApplication(${x}, ${flag})`),
  },
  GotoNetflix: (url, source) => console.info(`[mock] GotoNetflix(${url}, ${source})`),
  GotoAIV: () => console.info('[mock] GotoAIV()'),
  GotoOpenInternet: () => console.info('[mock] GotoOpenInternet()'),
  GotoFVPApp: (url) => console.info(`[mock] GotoFVPApp(${url})`),
  getAit: (_url, _ref, _tpl, cb) => { console.info('[mock] getAit()'); cb('mock://deeplink'); },
  getToken: () => null as unknown as string,
  getCountry: () => 'gb',
  getLanguage: () => 'en',
  getDeviceModel: () => 'desktop',
  getSWVersion: () => '0.0.0.dev',
};

/** True when the real firmware dialect is present (probe result, U1). */
export const hasFirmware = (): boolean =>
  typeof w.loadApp === 'function' || typeof w.loadLocalUI === 'function';

function api(): TitanWindow {
  return hasFirmware() ? w : { ...mocks, __mock: true } as TitanWindow;
}

export function loadApp(url: string, name: string, appType: string, resolution: string): void {
  api().loadApp?.(url, name, appType, resolution);
}

export function loadLocalUI(id: string): void {
  api().loadLocalUI?.(id);
}

export function launchApplication(urlOrId: string, flag: number): void {
  api().ApplicationController?.launchApplication?.(urlOrId, flag);
}

export function gotoNetflix(url: string, source = 'homepage'): void {
  api().GotoNetflix?.(url, source);
}

export function gotoAIV(): void {
  api().GotoAIV?.();
}

export function gotoOpenInternet(): void {
  api().GotoOpenInternet?.();
}

/** FVP apps launch through DVB AIT signalling; falls back to GotoFVPApp. */
export function launchFVP(url: string, isTemplate = false): void {
  const a = api();
  if (typeof a.getAit === 'function') {
    a.getAit(url, 'homepage', isTemplate, (deeplink) =>
      a.ApplicationController?.launchApplication?.(deeplink, 2));
  } else {
    a.GotoFVPApp?.(url);
  }
}

export function tuneLinearChannel(channelNumber: number, sid?: string): void {
  // No dedicated bridge observed; the stock launcher uses launchLinearChannel
  // (docs/03 tier 1). Try the plausible names in order.
  const a = w as unknown as Record<string, ((...args: unknown[]) => void) | undefined>;
  const candidates = ['launchLinearChannel', 'LaunchLinearChannel'];
  for (const name of candidates) {
    if (typeof a[name] === 'function') { a[name]!(channelNumber, 'launcher', sid); return; }
  }
  console.info(`[mock] tuneLinearChannel(${channelNumber})`);
}

// -- device info ------------------------------------------------------------

export function token(): string | null {
  try { return w.getToken?.() ?? null; } catch { return null; }
}

export function country(): string {
  try { return w.getCountry?.() ?? 'gb'; } catch { return 'gb'; }
}

export function language(): string {
  try { return w.getLanguage?.() ?? 'en'; } catch { return 'en'; }
}

export function deviceInfo(): { model: string; sw: string } {
  try {
    return { model: w.getDeviceModel?.() ?? 'unknown', sw: w.getSWVersion?.() ?? 'unknown' };
  } catch { return { model: 'unknown', sw: 'unknown' }; }
}

export function notifyVersion(version: string): void {
  try { w.NotifyLauncherVersion?.(version); } catch { /* optional */ }
}
