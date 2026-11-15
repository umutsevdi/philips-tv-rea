/* Client for the local proxy (titanos/proxy/server.py) that fronts the
   TV's JointSpace API. Same-origin when served by the proxy; the proxy
   handles digest auth and the 0.7 s request gate on the TV side. */

export interface TvChannel {
  id: number;
  name: string;
  number: number;
  logo?: string;
  preset?: string;
}

export interface TvContext {
  source?: string;
  channel?: string;
  app?: string;
}

const REQUEST_TIMEOUT_MS = 4000;

async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS) : null;
    try {
      const res = await fetch(`/api${path}`, { ...init, signal: ctrl?.signal });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

export function channels(): Promise<TvChannel[] | null> {
  return api<TvChannel[]>('/channels');
}

export function context(): Promise<TvContext | null> {
  return api<TvContext>('/context');
}

/** Tune by channel number: sends Digit keys then confirms, proxy-gated. */
export function tune(channelNumber: number): Promise<boolean> {
  return api<{ ok: boolean }>('/tune', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: channelNumber }),
  }).then((r) => r?.ok === true);
}
