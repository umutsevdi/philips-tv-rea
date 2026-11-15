import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

/* Boot-token capture (docs/research U2): when the DNS override works, the
   firmware opens the launcher URL with the device JWT appended. Log the
   full path the moment it lands so the token can be replayed elsewhere. */
const LOG = join(process.cwd(), 'access.log');

export async function handle({ event, resolve }) {
  const jwt = event.url.searchParams.get('jwt');
  if (jwt) {
    try {
      appendFileSync(LOG,
        `${new Date().toISOString()} ${event.request.method} ${event.url.pathname}${event.url.search}\n`);
    } catch { /* logging must never break serving */ }
  }
  return resolve(event);
}
