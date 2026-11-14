/* Launch dispatch — one table covering the three tiers from docs/03.
   Every call is bridge-guarded; unknown codes fall through to generic
   loadApp exactly like the stock launcher's dispatch order. */

import {
  loadApp, loadLocalUI, gotoNetflix, gotoAIV, launchFVP, tuneLinearChannel,
} from '../bridge/device';
import type { LaunchSpec } from '../api/titan';

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
      if (spec.url) loadApp(spec.url, spec.name, spec.appType, spec.resolution);
      else console.info('[launch] webapp URL not configured yet (see docs/09 U11)');
      break;
    case 'netflix':
      gotoNetflix(spec.url ?? '');
      break;
    case 'prime':
      gotoAIV();
      break;
    case 'fvp':
      launchFVP(spec.url);
      break;
    case 'deeplink':
      window.open(spec.url, '_blank');
      break;
  }
}

/** Launch a raw URL the way the stock launcher would classify it. */
export function launchUrl(url: string, name: string, appType = 'NetTV', resolution = '1080p'): void {
  if (/netflix/i.test(url)) { gotoNetflix(url); return; }
  if (/primevideo|amazon/i.test(url)) { gotoAIV(); return; }
  loadApp(url, name, appType, resolution);
}
