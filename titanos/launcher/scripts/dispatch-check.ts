// Quick dispatch-table checks against docs/03 cases using the real module.
import { specFromDeeplink } from '../src/lib/api/titan.ts';

const app = (over) => ({ id: 'x', code: 'x', name: 'X', icon: '', url: 'https://x', app_type: 'NetTV', resolution: '1080p', isFVPApp: false, ...over });

const cases = [
  [{ app: app({ code: 'netflix' }), url: 'nflx://' }, 'netflix'],
  [{ app: app({ code: 'prime_video' }), url: 'https://prime' }, 'prime'],
  [{ app: app({ code: 'youtube', app_type: 'NetTVSpecial' }), url: 'https://yt' }, 'webapp'],
  [{ app: app({ code: 'bbc_iplayer', isFVPApp: true }), url: 'fvp://bbc' }, 'fvp'],
  [{ app: app({ code: 'free_channels' }), url: 'https://any' }, 'deeplink'],
  [{ app: app({ code: 'rakuten_tv' }), url: 'https://rt' }, 'webapp'],
];

let pass = 0;
for (const [input, expected] of cases) {
  const got = specFromDeeplink(input).kind;
  if (got === expected) pass++; else console.error(`FAIL ${JSON.stringify(input.app.code)}: got ${got}, want ${expected}`);
}
console.log(`${pass}/${cases.length} dispatch cases pass`);
process.exit(pass === cases.length ? 0 : 1);
