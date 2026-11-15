/* Raw HTTP/1.1 over a TLS socket with the curl-style cipher list — the
   TV's TLS fingerprinting fix. Shared by tv.ts and pair.ts. */

import * as tls from 'node:tls';

export const CURL_CIPHERS =
  'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:' +
  'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:' +
  'ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:' +
  'ECDHE-RSA-AES128-SHA:ECDHE-RSA-AES256-SHA:AES128-GCM-SHA256:' +
  'AES256-GCM-SHA384:AES128-SHA:AES256-SHA';

export interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  raw: string;   // body as text
  buffer: Buffer; // body as bytes
}

function connect(host: string): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host,
      port: 1926,
      ciphers: CURL_CIPHERS,
      rejectUnauthorized: false, // self-signed TV cert
      servername: host,
    }, () => resolve(socket));
    socket.once('error', reject);
    socket.setTimeout(15_000, () => socket.destroy(new Error('timeout')));
  });
}

function roundTrip(conn: tls.TLSSocket, host: string, method: string, path: string,
                   body: string | null, authHeader?: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const payload = body !== null ? Buffer.from(body) : null;
    const head = [
      `${method} ${path} HTTP/1.1`,
      `Host: ${host}:1926`,
      'Connection: close',
      'Content-Type: application/json',
      ...(authHeader ? [`Authorization: ${authHeader}`] : []),
      ...(payload ? [`Content-Length: ${payload.length}`] : []),
      '\r\n',
    ].join('\r\n');
    const chunks: Buffer[] = [];
    conn.on('data', (c: Buffer) => chunks.push(c));
    conn.on('close', () => {
      const buf = Buffer.concat(chunks);
      const sep = buf.indexOf('\r\n\r\n');
      if (sep < 0) { reject(new Error('no HTTP response')); return; }
      const headStr = buf.subarray(0, sep).toString('utf8');
      const bodyBuf = buf.subarray(sep + 4);
      const lines = headStr.split('\r\n');
      const status = parseInt(lines[0]?.split(' ')[1] ?? '0', 10);
      const headers: Record<string, string | string[] | undefined> = {};
      for (const line of lines.slice(1)) {
        const idx = line.indexOf(':');
        if (idx > 0) {
          const k = line.slice(0, idx).trim().toLowerCase();
          const v = line.slice(idx + 1).trim();
          const existing = headers[k];
          headers[k] = existing === undefined ? v : (Array.isArray(existing) ? [...existing, v] : [existing, v]);
        }
      }
      resolve({ status, headers, raw: bodyBuf.toString('utf8'), buffer: bodyBuf });
    });
    conn.on('error', reject);
    conn.write(head + (payload ? payload.toString('utf8') : ''));
  });
}

/** One request, one connection. */
export async function tlsRequest(host: string, method: string, path: string,
                                 body: string | null = null,
                                 authHeader?: string): Promise<RawResponse> {
  const conn = await connect(host);
  try {
    return await roundTrip(conn, host, method, path, body, authHeader);
  } finally { conn.destroy(); }
}

/** The grant quirk needs challenge + authenticated retry on the SAME
    connection; the caller drives both round trips on one socket. */
export async function tlsRequestSingleConnection(host: string, method: string, path: string,
                                                  body: string | null = null,
                                                  authHeader?: string): Promise<RawResponse> {
  const conn = await connect(host);
  try {
    return await roundTrip(conn, host, method, path, body, authHeader);
  } finally { conn.destroy(); }
}
