<script lang="ts">
  import { launch } from '../launch/dispatch';
  import { register, unregister } from '../nav/spatial';
  import { onMount } from 'svelte';
  import { specFromDeeplink } from '../api/titan';
  import type { ContentItem } from '../api/titan';

  export let item: ContentItem;
  export let row = 1;
  let el: HTMLElement;
  const id = `card:${item.id}`;

  $: artwork = item.images?.artwork_landscape ?? item.images?.icon_landscape ?? '';
  $: spec = item.deeplinkings?.[0] ? specFromDeeplink(item.deeplinkings[0]) : null;

  // deterministic muted gradient per item, so placeholder art feels varied
  function posterGrad(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
    return 'linear-gradient(145deg, hsl(' + h + ' 22% 26%), hsl(' + ((h + 40) % 360) + ' 26% 15%))';
  }

  function open() { if (spec) launch(spec); }
  onMount(() => {
    register({ id, el, row, col: -1 });
    return () => unregister(id);
  });
</script>

<button bind:this={el} class="focusable card" id={id} tabindex="-1" on:click={open}>
  {#if artwork}
    <img src={artwork} alt="" loading="lazy" />
  {:else}
    <div class="noart" style:background={posterGrad(item.id)}>{item.title?.[0] ?? '#'}</div>
  {/if}
  {#if item.title}
    <div class="title">{item.title}</div>
  {/if}
</button>

<style>
  .card {
    width: 240px;
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--surface);
    text-align: left;
    flex-shrink: 0;
  }
  .card img {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    background: var(--surface-2);
  }
  .noart {
    width: 100%;
    aspect-ratio: 16 / 9;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-size: 40px;
    color: rgba(232, 237, 242, 0.25);
  }
  .title {
    padding: 8px 10px;
    font-size: 13px;
    color: var(--dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card:focus .title { color: var(--text); }
</style>
