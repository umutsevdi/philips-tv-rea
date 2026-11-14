/* App catalog sources (docs/03 "Where the app list comes from"), merged by
   id, later sources winning:

     1. catalog.json — committed offline fallback: the tier-3 webapps whose
        launch URLs are known from the launch-model docs.
     2. /me/apps — the device's real store list (docs/04). Gated on the
        firmware-issued token whose header is still unverified (09/U4), so
        it engages automatically once that probe lands.
     3. localStorage DEVICE_APPS — the FVP/Freely inventory the firmware
        caches (getDeviceContent('fvp')). Needs no backend auth and is the
        only place installed FVP launch URLs exist (09/U11).

   Sources 2/3 shapes are inferred from the stock bundles and flagged for
   the on-device probe — parsing is defensive by design. */

import catalogJson from '../../../catalog.json';
import { fetchAppCatalog } from '../api/titan';
import type { Tile } from '../api/titan';

export const catalogFallback: Tile[] = (catalogJson as { apps: Tile[] }).apps;

export async function loadCatalog(): Promise<Tile[]> {
  const byId = new Map<string, Tile>();
  for (const t of catalogFallback) byId.set(t.id, t);

  for (const t of await fetchAppCatalog()) byId.set(t.id, t);

  try {
    const raw = localStorage.getItem('DEVICE_APPS');
    if (raw) {
      const list: unknown = JSON.parse(raw);
      const items: unknown[] = Array.isArray(list)
        ? list
        : Array.isArray((list as { apps?: unknown[] })?.apps)
          ? (list as { apps: unknown[] }).apps
          : [];
      for (const it of items) {
        const o = it as { id?: string; appTitle?: string; name?: string; url?: string };
        if (!o.url || !(o.appTitle ?? o.name)) continue;
        const id = 'fvp:' + (o.id ?? (o.appTitle ?? o.name)!.toLowerCase().replace(/\s+/g, '_'));
        if (byId.has(id)) continue;
        byId.set(id, {
          id,
          name: (o.appTitle ?? o.name)!,
          launch: { kind: 'fvp', url: o.url! },
        });
      }
    }
  } catch { /* absent or not JSON — the fallback stands */ }

  return [...byId.values()];
}
