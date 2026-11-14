<script lang="ts">
  import { register, unregister } from '../nav/spatial';
  import { onMount } from 'svelte';
  import { tune } from '../api/tv';
  import type { TvChannel } from '../api/tv';

  export let channel: TvChannel;
  export let row = 2;
  export let nowPlaying: string | null = null;
  let el: HTMLElement;
  const id = `ch:${channel.id}`;

  // deterministic muted gradient, matches Card placeholders
  function posterGrad(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
    return `linear-gradient(145deg, hsl(${h} 22% 26%), hsl(${(h + 40) % 360} 26% 15%))`;
  }

  function open() { tune(channel.number); }
  onMount(() => {
    register({ id, el, row, col: -1 });
    return () => unregister(id);
  });
</script>

<button bind:this={el} class="focusable ch-card" id={id} tabindex="-1" aria-label={`${channel.number} ${channel.name}`} on:click={open}>
  <div class="art" style:background={posterGrad(String(channel.id))}>
    <span class="ch-num">{channel.number}</span>
    <span class="live-badge">Live</span>
  </div>
  <div class="meta">
    <div class="name">{channel.name}</div>
    {#if nowPlaying}
      <div class="now">{nowPlaying}</div>
    {/if}
  </div>
</button>

<style>
  .ch-card {
    width: var(--span-3);
    border-radius: var(--radius);
    overflow: hidden;
    text-align: left;
    flex-shrink: 0;
  }
  .ch-card:global(.focused) { background: var(--glass-2); }
  .art {
    width: 100%;
    height: 152px; /* 16:9 of span-3; fallback for builds without aspect-ratio */
    position: relative;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 8px 10px;
  }
  @supports (aspect-ratio: 16 / 9) {
    .art { height: auto; aspect-ratio: 16 / 9; }
  }
  .ch-num {
    font-family: var(--font-display);
    font-size: var(--fs-headline);
    font-weight: 700;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    line-height: var(--lh-tight);
  }
  .live-badge {
    font-size: var(--fs-caption);
    font-weight: 500;
    letter-spacing: 0.06em;
    color: var(--live);
    background: var(--live-soft);
    border: 1px solid var(--live-border);
    border-radius: 999px;
    padding: 1px 8px;
  }
  .meta {
    padding: 8px 12px 12px;
  }
  .name {
    font-size: var(--fs-label);
    font-weight: 500;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .now {
    font-size: var(--fs-caption);
    color: var(--dim);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
