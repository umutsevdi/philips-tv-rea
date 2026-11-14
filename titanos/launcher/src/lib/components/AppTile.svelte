<script lang="ts">
  import { launch } from '../launch/dispatch';
  import { register, unregister } from '../nav/spatial';
  import { onMount } from 'svelte';
  import { Settings, RadioReceiver, Calendar, Folder, Globe, List, Radio, Circle } from '@lucide/svelte';
  import type { Tile } from '../api/titan';

  export let tile: Tile;
  export let row = 0;
  let el: HTMLElement;
  const id = `tile:${tile.id}`;

  const lucideMap: Record<string, any> = { Settings, RadioReceiver, Calendar, Folder, Globe, List, Radio };

  // 'ui' tiles use lucide icons; lettermark brands render text; everything
  // else loads the committed brand SVG from public/brands/.
  $: kind = tile.brand === 'ui' ? 'icon'
    : ['prime', 'disney', 'rakuten'].includes(tile.brand ?? '') ? 'letter'
    : tile.brand ? 'svg' : 'plain';
  $: icon = lucideMap[tile.icon ?? ''];
  $: svgUrl = kind === 'svg' ? `/brands/${tile.brand}.svg` : '';

  function letterText(): string {
    switch (tile.brand) {
      case 'prime': return 'prime';
      case 'disney': return 'D+';
      case 'rakuten': return 'R';
      default: return tile.name[0];
    }
  }

  function open() { launch(tile.launch); }
  onMount(() => {
    register({ id, el, row, col: -1 });
    return () => unregister(id);
  });
</script>

<button bind:this={el} class="focusable app-tile" id={id} tabindex="-1" on:click={open}>
  {#if kind === 'icon' && icon}
    {@const Icon = icon}
    <Icon size={40} strokeWidth={1.5} color="var(--dim)" />
  {:else if kind === 'letter'}
    <div class="lettermark" style:background={tile.color ?? 'var(--surface-2)'}>{letterText()}</div>
  {:else if kind === 'svg'}
    <img class="brand" src={svgUrl} alt="" loading="lazy" />
  {:else}
    {@const Fallback = Circle}
    <Fallback size={40} strokeWidth={1.5} color="var(--dim)" />
  {/if}
  <div class="name">{tile.name}</div>
</button>

<style>
  .app-tile {
    width: 160px;
    height: 112px;
    border-radius: 12px;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--text);
    flex-shrink: 0;
  }
  .app-tile:focus { background: var(--surface-2); }
  .brand {
    width: 52px;
    height: 52px;
    object-fit: contain;
  }
  .lettermark {
    min-width: 56px;
    height: 40px;
    padding: 0 12px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 20px;
    color: #fff;
    letter-spacing: -0.02em;
  }
  .name {
    font-size: 13px;
    color: var(--dim);
    max-width: 90%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .app-tile:focus .name { color: var(--text); }
</style>
