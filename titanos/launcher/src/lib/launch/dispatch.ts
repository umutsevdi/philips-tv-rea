/* Launch dispatch — one table covering the three tiers from docs/03.
   Every call is bridge-guarded; unknown codes fall through to generic
   loadApp exactly like the stock launcher's dispatch order. */

import {
  loadApp, loadLocalUI, gotoNetflix, gotoAIV, launchFVP, tuneLinearChannel, hasFirmware,
} from '../bridge/device';
import type { LaunchSpec } from '../api/titan';

/** Degraded mode (no firmware dialect — a generic browser shell): navigate
    to the URL. In TV browser shells window.open is caught by the popup
    blocker (the "popup created" notification), so navigation is same-tab
    there and Back returns via history; desktop keeps the console mock. */
const TV_SHELL = /Vewd|Whale|HbbTV|SmartTV|SMART-TV|NetCast|Tizen|Web0S|Philips|armv\d|Android/i
  .test(navigator.userAgent);

function openFallback(url: string, what: string): void {
  if (TV_SHELL) {
    console.info(`[launch] no firmware bridge, navigating: ${url}`);
    window.location.assign(url);
  } else {
    console.info(`[mock] ${what}: ${url}`);
  }
}

export function launch(spec: LaunchSpec): void {
  switch (spec.kind) {
    case 'broadcast':
      // Probe-fallback chain (README, docs/09 U1): the firmware's linear
      // channel bridge first; when the dialect is absent, open the native
      // channel list screen so broadcast is always reachable.
      if (!tuneLinearChannel(1)) loadLocalUI('channels');
      break;
    case 'local-ui':
      loadLocalUI(spec.uiId);
      break;
    case 'webapp':
      if (!spec.url) { console.info('[launch] webapp URL not configured yet (see docs/09 U11)'); break; }
      if (hasFirmware()) loadApp(spec.url, spec.name, spec.appType, spec.resolution);
      else openFallback(spec.url, spec.name);
      break;
    case 'netflix':
      if (spec.url && !hasFirmware()) openFallback(spec.url, 'Netflix');
      else gotoNetflix(spec.url ?? '');
      break;
    case 'prime':
      gotoAIV();
      break;
    case 'fvp':
      if (hasFirmware()) launchFVP(spec.url);
      else openFallback(spec.url, 'FVP app');
      break;
    case 'deeplink':
      if (TV_SHELL) window.location.assign(spec.url);
      else window.open(spec.url, '_blank');
      break;
  }
}

/** Launch a raw URL the way the stock launcher would classify it. */
export function launchUrl(url: string, name: string, appType = 'NetTV', resolution = '1080p'): void {
  if (/netflix/i.test(url)) { gotoNetflix(url); return; }
  if (/primevideo|amazon/i.test(url)) { gotoAIV(); return; }
  loadApp(url, name, appType, resolution);
}
