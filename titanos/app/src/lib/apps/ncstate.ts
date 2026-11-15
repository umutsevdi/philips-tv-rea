/* Nextcloud view lifecycle (plan: back stack integration, focus restore).
   The App shell owns the dialog/view model; this store is the single
   source of truth for "which Nextcloud surface is open" so the key
   handler can route D-pad actions to the browser or the viewer. */

import { writable } from 'svelte/store';
import type { NcEntry } from '../api/nextcloud';

export type NcView =
  | { open: false }
  | { open: true; browser: true }
  | { open: true; browser: false; media: NcEntry[]; index: number };

export const nc = writable<NcView>({ open: false });

export function ncOpenBrowser(): void {
  nc.set({ open: true, browser: true });
}

export function ncOpenViewer(media: NcEntry[], index: number): void {
  nc.set({ open: true, browser: false, media, index });
}

export function ncCloseViewer(): void {
  nc.set({ open: true, browser: true });
}

export function ncCloseAll(): void {
  nc.set({ open: false });
}
