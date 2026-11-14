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
    <img src={artwork} alt="" loading="lazy" decoding="async" />
  {:else}
    <div class="noart" style:background={posterGrad(item.id)}>{item.title?.[0] ?? '#'}</div>
  {/if}
  {#if item.title}
    <div class="title">{item.title}</div>
  {/if}
</button>

<style>
  .card {
    width: var(--span-3);
    border-radius: var(--radius);
    overflow: hidden;
    text-align: left;
    flex-shrink: 0;
  }
  .card:global(.focused) { background: var(--glass-2); }
  .card img {
    width: 100%;
    height: 152px; /* 16:9 of span-3; fallback for builds without aspect-ratio */
    object-fit: cover;
    background: var(--surface-2);
  }
  @supports (aspect-ratio: 16 / 9) {
    .card img { height: auto; aspect-ratio: 16 / 9; }
  }
  .noart {
    width: 100%;
    height: 152px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-size: 40px;
    color: rgba(232, 237, 242, 0.25);
  }
  @supports (aspect-ratio: 16 / 9) {
    .noart { height: auto; aspect-ratio: 16 / 9; }
  }
  .title {
    padding: 9px 12px 11px;
    font-family: var(--font-display);
    font-size: var(--fs-title);
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: var(--lh-tight);
    color: var(--dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card:global(.focused) .title { color: var(--text); }
</style>
