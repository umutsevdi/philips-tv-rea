/* TV pairing protocol (docs/research: "Pairing protocol"):
     1. POST /6/pair/request  with a generated signature + client id
     2. TV shows a PIN for 30 s
     3. POST /6/pair/grant   with auth_key + PIN over digest auth, and the
        authenticated retry MUST run on the SAME TCP connection (the daemon
        wedges otherwise).
   The shared auth_key from the grant becomes the digest password for all
   later /6/* calls (username = the client id). */

import * as crypto from 'node:crypto';
import { tlsRequest, tlsRequestSingleConnection, type RawResponse } from './tls';

const PAIR_KEY = Buffer.from([
  0x1e, 0x77, 0x2c, 0xa8, 0x85, 0x1d, 0x77, 0x2e, 0xf1, 0xf6, 0x4d, 0x1b, 0x28, 0x27, 0xd0, 0x7f,
]);

function hmac(secret: Buffer, data: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex').toUpperCase();
}

export interface PairSession { authKey: string; timestamp: number }

/** Step 1: pair/request. Returns the auth_key the grant needs. */
export async function requestPair(host: string, user: string): Promise<PairSession> {
  const timestamp = Math.floor(Date.now() / 1000);
  const deviceId = crypto.randomBytes(16).toString('hex');
  const signature = hmac(PAIR_KEY, `${deviceId}${timestamp}`);
  const body = {
    auth: {
      Signature: signature,
      Client: { id: user, app: 'imza', devicespec: 'mac=[]' },
    },
  };
  const res = await tlsRequest(host, 'POST', '/6/pair/request', JSON.stringify(body));
  if (res.status !== 200) {
    throw new Error(`pair/request failed: ${res.status} (is the TV on and the API up?)`);
  }
  let authKey = '';
  try {
    const data = JSON.parse(res.raw);
    authKey = data?.auth_key ?? data?.auth?.auth_key ?? '';
  } catch { /* fallthrough */ }
  if (!authKey) throw new Error('pair/request returned no auth_key');
  return { authKey, timestamp };
}

/** Step 2: pair/grant. Digest auth where password = auth_key, username =
    the client id; the authenticated retry rides the same connection. */
export async function grantPair(host: string, user: string,
                                authKey: string, pin: string): Promise<void> {
  const body = JSON.stringify({
    auth: { auth_Accept: 'true', auth_key: authKey, PIN: pin },
  });
  const digest = (method: string, path: string, challenge: string): string => {
    const clean: Record<string, string> = {};
    for (const part of challenge.replace(/^Digest\s+/i, '').split(',')) {
      const eq = part.indexOf('=');
      if (eq > 0) clean[part.slice(0, eq).trim()] = part.slice(eq + 1).trim().replace(/^"|"$/g, '');
    }
    const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex');
    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');
    const ha1 = md5(`${user}:${clean.realm}:${authKey}`);
    const ha2 = md5(`${method}:${path}`);
    return `Digest username="${user}", realm="${clean.realm}", nonce="${clean.nonce}", `
      + `uri="${path}", response="${md5(`${ha1}:${clean.nonce}:${nc}:${cnonce}:${clean.qop ?? 'auth'}:${ha2}`)}", `
      + `qop=${clean.qop ?? 'auth'}, nc=${nc}, cnonce="${cnonce}"`;
  };
  const first: RawResponse = await tlsRequestSingleConnection(host, 'POST', '/6/pair/grant', body);
  if (first.status !== 401) {
    throw new Error(`pair/grant expected a 401 challenge, got ${first.status}`);
  }
  const auth = digest('POST', '/6/pair/grant',
    (first.headers['www-authenticate'] as string) ?? '');
  const second: RawResponse = await tlsRequestSingleConnection(host, 'POST', '/6/pair/grant', body, auth);
  if (second.status !== 200) {
    throw new Error(`pair/grant failed: ${second.status} (wrong PIN or window expired)`);
  }
}
