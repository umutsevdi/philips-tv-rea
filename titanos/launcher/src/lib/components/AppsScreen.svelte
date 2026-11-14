<script lang="ts">
  /* Apps screen: the full TitanOS web-app catalog (docs/08 on-demand
     catalog). Presentational only — the App shell owns navigation scoping,
     the options dialog and pin storage. Grid rows are explicit flex rows of
     6 (no flex-wrap/gap: unverified on this build); tiles stretch so each
     row ends flush at the safe-area edge, capped at the span-3 card width. */
  import TopBar from './TopBar.svelte';
  import AppTile from './AppTile.svelte';
  import { pins } from '../apps/pins';
  import type { Tile } from '../api/titan';

  export let apps: Tile[] = [];
  export let utilities: Tile[] = [];
  export let onselect: (tile: Tile) => void = () => {};

  const PER_ROW = 6; // 6*172px + 5*24px = 1152px = safe-area width
  function chunk(list: Tile[], size: number): Tile[][] {
    const out: Tile[][] = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  }
  $: rows = chunk(apps, PER_ROW);
  $: pinnedIds = $pins.ids;
</script>

<TopBar {utilities} idPrefix="apps:" />

<div class="page">
  <h1>All apps</h1>
  <div class="grid">
    {#each rows as rowApps, r (r)}
      <div class="grid-row">
        {#each rowApps as app (app.id)}
          <AppTile tile={app} row={r} scope="apps:" pinned={pinnedIds.includes(app.id)} onopen={() => onselect(app)} />
        {/each}
      </div>
    {/each}
  </div>
  <span class="sr-only" role="status" aria-live="polite">{$pins.message}</span>
</div>

<!-- TV-native key hints: colour-key legend pattern, pinned to the bottom
     safe edge, shown only on this screen. -->
<footer class="pills" aria-hidden="true">
  <span class="pill"><kbd>OK</kbd>Options</span>
  <span class="pill"><kbd>BACK</kbd>Home</span>
</footer>

<style>
  .page {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
    /* same inset rhythm as home's .rows (16px top under the shared TopBar) */
    padding: 16px var(--safe-x) calc(var(--safe-y) + 48px);
  }
  .page::-webkit-scrollbar { display: none; }
  h1 {
    font-family: var(--font-display);
    font-size: var(--fs-title);
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: var(--lh-tight);
    color: var(--text);
    margin: 0 0 16px;
  }
  .grid-row {
    display: flex;
  }
  .grid-row + .grid-row { margin-top: 24px; }
  .grid-row :global(.app-tile) {
    /* stretch to fill the row: flex-basis comes from the tile's own width,
       free space is shared equally, capped at the span-3 card width */
    flex: 1 1 auto;
    max-width: var(--span-3);
  }
  .pills {
    position: fixed;
    right: var(--safe-x);
    bottom: var(--safe-y);
    display: flex;
    z-index: 5;
  }
  .pill {
    display: flex;
    align-items: center;
    font-size: var(--fs-caption);
    font-weight: 500;
    letter-spacing: 0.02em;
    color: var(--dim);
  }
  .pill + .pill { margin-left: 20px; }
  .pill kbd {
    font-family: var(--font-display);
    font-size: var(--fs-caption);
    font-weight: 600;
    color: var(--dim);
    background: var(--glass);
    border: 1px solid var(--glass-border);
    border-bottom-color: var(--glass-border);
    border-radius: 6px;
    padding: 3px 8px;
    margin-right: 8px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
