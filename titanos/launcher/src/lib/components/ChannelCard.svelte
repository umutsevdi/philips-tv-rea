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

<button bind:this={el} class="focusable ch-card" id={id} tabindex="-1" on:click={open}>
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
    width: 200px;
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--surface);
    text-align: left;
    flex-shrink: 0;
  }
  .art {
    width: 100%;
    aspect-ratio: 16 / 9;
    position: relative;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 8px;
  }
  .ch-num {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 700;
    color: rgba(232, 237, 242, 0.85);
    font-variant-numeric: tabular-nums;
  }
  .live-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #fff;
    background: #d23b3b;
    border-radius: 4px;
    padding: 2px 6px;
  }
  .meta {
    padding: 8px 10px 10px;
  }
  .name {
    font-size: 13px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .now {
    font-size: 11px;
    color: var(--dim);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
