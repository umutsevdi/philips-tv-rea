/* JointSpace v6 transport for TPV-built Philips Saphi TVs, ported 1:1 from
   the retired Python proxy (philips_tv/transport.py). Firmware quirks this
   module works around (details in titanos/docs/research/README):

   1. TLS fingerprinting: the TV rejects default handshakes with an instant
      403 on every endpoint. Setting the explicit curl-style cipher list on
      tls.connect makes Node negotiate like curl and pass (Node docs:
      tls.connect accepts `ciphers` — OpenSSL format, same as Python).
   2. Pairing grant MUST retry on the SAME TCP connection, or the daemon
      hangs until wall power-cycle. Other /6/* endpoints take the normal
      two-connection digest flow.
   3. Body-less POSTs get 503; we always send a JSON body.

   Everything routes through a 0.7 s gate: bursts crash the TV daemon. */

import * as crypto from 'node:crypto';
import { loadConfig, saveSection } from './config';
import { tlsRequestSingleConnection, type RawResponse } from './tls';

export interface TvCredentials { user: string; password: string }

export interface TvResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  json<T = unknown>(): T | null;
}

/* Credentials come from the central config (server/config.ts). */
export function loadCredentials(): TvCredentials | null {
  const tv = loadConfig().tv;
  return tv ? { user: tv.user, password: tv.password } : null;
}

export function saveCredentials(host: string, creds: TvCredentials): void {
  saveSection('tv', { host, user: creds.user, password: creds.password });
}

export function loadTvHost(): string | null {
  return loadConfig().tv?.host ?? null;
}

export class JointSpace {
  readonly host: string;
  readonly port = 1926;
  private credentials: TvCredentials | null;
  private lastRequest = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private static readonly MIN_SPACING = 0.7;

  constructor(host: string, credentials: TvCredentials | null = null) {
    this.host = host;
    this.credentials = credentials;
  }

  get(path: string): Promise<TvResponse> { return this.request(path, 'GET'); }
  post(path: string, body: unknown = {}): Promise<TvResponse> { return this.request(path, 'POST', body); }

  hasCredentials(): boolean { return this.credentials !== null; }

  private digestHeader(method: string, path: string, challenge: string): string {
    const clean: Record<string, string> = {};
    for (const part of challenge.replace(/^Digest\s+/i, '').split(',')) {
      const eq = part.indexOf('=');
      if (eq > 0) clean[part.slice(0, eq).trim()] = part.slice(eq + 1).trim().replace(/^"|"$/g, '');
    }
    const realm = clean.realm, nonce = clean.nonce;
    const qop = clean.qop ?? 'auth';
    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');
    const creds = this.credentials!;
    const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex');
    const ha1 = md5(`${creds.user}:${realm}:${creds.password}`);
    const ha2 = md5(`${method}:${path}`);
    const response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
    return `Digest username="${creds.user}", realm="${realm}", nonce="${nonce}", `
      + `uri="${path}", response="${response}", qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  }

  /** All public calls serialize through this chain = the 0.7 s gate. */
  private gated<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const wait = JointSpace.MIN_SPACING * 1000 - (Date.now() - this.lastRequest);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastRequest = Date.now();
      return fn();
    });
    // keep the chain alive even when a request fails
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async request(path: string, method: string, body?: unknown,
                        singleConnection = false): Promise<TvResponse> {
    return this.gated(async () => {
      const payload = body !== undefined ? JSON.stringify(body) : null;
      const first: RawResponse = await tlsRequestSingleConnection(
        this.host, method, path, payload);
      if (first.status !== 401 || !this.credentials) return this.toResponse(first);
      // digest challenge — authenticate and retry
      const challenge = (first.headers['www-authenticate'] as string) ?? '';
      const auth = this.digestHeader(method, path, challenge);
      // grant quirk wants the same TCP connection; normal endpoints take a
      // fresh one. tlsRequestSingleConnection opens fresh per call — which
      // is exactly the /6/* behavior; the grant path (pair.ts) manages its
      // own single socket. Nonce reuse across connections is fine.
      const retry: RawResponse = await tlsRequestSingleConnection(
        this.host, method, path, payload, auth);
      return this.toResponse(retry);
    });
  }

  private toResponse(r: { status: number; headers: Record<string, string | string[] | undefined>; raw: string }): TvResponse {
    let parsed: unknown = null;
    try { parsed = r.raw.trim() ? JSON.parse(r.raw) : null; } catch { parsed = null; }
    return {
      status: r.status,
      headers: r.headers,
      body: r.raw,
      json<T = unknown>() { return parsed as T | null; },
    };
  }
}

let instance: JointSpace | null = null;

export function getTv(): JointSpace {
  if (!instance) {
    const host = loadTvHost() ?? '';
    instance = new JointSpace(host, loadCredentials());
  }
  return instance;
}

/** First-run: the /pair page sets host+credentials, then resets the client. */
export function setTv(host: string, creds: TvCredentials): void {
  saveCredentials(host, creds);
  instance = new JointSpace(host, creds);
}
