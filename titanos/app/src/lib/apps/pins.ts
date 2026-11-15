/* Pinned catalog apps (docs/08 on-demand catalog): the home screen shows
   built-in tiles plus every catalog app the user pinned. Pin state lives in
   localStorage and a Svelte store so the home row updates live while the
   Apps screen is open. Built-in tiles (tiles.json) are not pinnable — the
   store only manages catalog apps. */

import { writable } from 'svelte/store';

const KEY = 'launcher.pinned';

/* First-run starter set: the stock launcher ships with favorites populated;
   users can unpin any of these from the Apps screen. */
const DEFAULT_PINS = ['youtube', 'disney', 'bbc_iplayer', 'itvx'];

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return [...DEFAULT_PINS];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

export const pins = writable<{ ids: string[]; message: string }>({ ids: load(), message: '' });

/** Pin or unpin a catalog app; message feeds the aria-live announcer. */
export function togglePin(id: string, name: string): void {
  pins.update(({ ids }) => {
    const has = ids.includes(id);
    const next = has ? ids.filter((x) => x !== id) : [...ids, id];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* full */ }
    return { ids: next, message: (has ? 'Removed from home: ' : 'Pinned to home: ') + name };
  });
}
