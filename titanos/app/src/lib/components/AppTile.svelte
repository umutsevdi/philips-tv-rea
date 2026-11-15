<script lang="ts">
  import { launch } from '../launch/dispatch';
  import { register, unregister } from '../nav/spatial';
  import { onMount } from 'svelte';
  import { Settings, RadioReceiver, Calendar, Folder, Globe, List, Radio, Tv, Image, HardDrive, Pin } from '@lucide/svelte';
  import type { Tile } from '../api/titan';
  import { tileArt } from '../apps/art';

  export let tile: Tile;
  export let row = 0;
  /* Catalog tiles open an options dialog instead of launching directly. */
  export let onopen: (() => void) | null = null;
  export let pinned = false;
  /* Registration namespace: a pinned catalog app renders in both views, so
     each view prefixes its ids ('apps:') to keep the spatial registry clean. */
  export let scope = '';
  let el: HTMLElement;
  const id = `${scope}tile:${tile.id}`;

  const lucideMap: Record<string, any> = { Settings, RadioReceiver, Calendar, Folder, Globe, List, Radio, Tv, Image, HardDrive };

  /* One art chain for every tile (lib/apps/art.ts): remote CDN icon →
     committed brand SVG → generated monogram. The monogram shows until an
     image proves it can render, and takes over again if the image fails. */
  $: art = tileArt(tile);
  $: showImg = art.kind !== 'monogram' && !imgFailed;
  $: icon = lucideMap[tile.icon ?? ''];
  let imgFailed = false;
  $: if (art.kind === 'monogram') imgFailed = false;

  function open() { if (onopen) onopen(); else launch(tile.launch); }
  onMount(() => {
    register({ id, el, row, col: -1 });
    return () => unregister(id);
  });
</script>

<button bind:this={el} class="focusable app-tile" id={id} tabindex="-1" aria-label={tile.name} on:click={open}>
  {#if pinned}
    <span class="pin-badge" aria-hidden="true">
      <Pin size={12} strokeWidth={2.5} />
    </span>
  {/if}
  {#if tile.brand === 'ui' && icon}
    {@const Icon = icon}
    <span class="ui-icon"><Icon size={40} strokeWidth={1.5} color="var(--dim)" /></span>
  {:else if showImg}
    <img class="brand" src={art.src} alt="" loading="lazy" decoding="async" on:error={() => { imgFailed = true; }} />
  {:else}
    <span class="monogram" style:background={`hsl(${art.hue} 32% 26%)`}>{art.initials}</span>
  {/if}
  <div class="name">{tile.name}</div>
</button>

<style>
  .app-tile {
    width: var(--span-2);
    height: 112px;
    border-radius: var(--radius-tile);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text);
    flex-shrink: 0;
  }
  .name { margin-top: 10px; }
  .app-tile:global(.focused) {
    transform: scale(var(--scale-icon));
    background: var(--glass-2);
  }
  .pin-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    color: var(--accent);
  }
  .brand {
    width: 52px;
    height: 52px;
    object-fit: contain;
  }
  .monogram {
    width: 52px;
    height: 52px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: var(--fs-title);
    color: var(--text);
    letter-spacing: -0.02em;
  }
  .name {
    font-size: var(--fs-label);
    font-weight: 500;
    color: var(--dim);
    max-width: 90%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .app-tile:global(.focused) .name { color: var(--text); }
</style>
