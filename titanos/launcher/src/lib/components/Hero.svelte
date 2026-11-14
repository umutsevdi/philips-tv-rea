<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { launch } from '../launch/dispatch';
  import { register, unregister } from '../nav/spatial';
  import { Play } from '@lucide/svelte';
  import { specFromDeeplink } from '../api/titan';
  import type { ContentItem } from '../api/titan';

  export let items: ContentItem[] = [];
  let current = 0;
  let el: HTMLElement;
  let timer: ReturnType<typeof setInterval> | null = null;
  const id = 'hero';
  let paused = false;

  $: item = items[current];
  $: backdrop = item?.images?.artwork_landscape ?? '';

  function next() { if (!paused && items.length) current = (current + 1) % items.length; }
  function go(i: number) { current = i; paused = true; }

  onMount(() => {
    register({ id, el, row: 0, col: -1 });
    timer = setInterval(next, 6000);
    return () => {
      unregister(id);
      if (timer) clearInterval(timer);
    };
  });

  function gradFor(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
    return 'linear-gradient(120deg, hsl(' + h + ' 30% 22%), hsl(' + ((h + 60) % 360) + ' 35% 12%))';
  }

  function open() {
    if (item?.deeplinkings?.[0]) launch(specFromDeeplink(item.deeplinkings[0]));
  }
</script>

<div
  bind:this={el}
  class="focusable hero"
  id={id}
  tabindex="-1"
  role="button"
  on:click={open}
  on:keydown={(e) => e.key === 'Enter' && open()}
  on:mouseenter={() => (paused = true)}
  on:mouseleave={() => (paused = false)}
>
  {#if item}
    {#if backdrop}
      <img class="backdrop" src={backdrop} alt="" />
    {:else}
      <div class="backdrop-fallback" style:background={gradFor(item.id)}></div>
    {/if}
    <div class="scrim"></div>
    <div class="content">
      <div class="brand-row">
        {#each item.deeplinkings ?? [] as d}
          <span class="source">{d.app.name}</span>
        {/each}
      </div>
      <h1 class="title">{item.title}</h1>
      {#if item.synopsis}
        <p class="synopsis">{item.synopsis}</p>
      {/if}
      <div class="actions">
        <button class="play" on:click|stopPropagation={open} tabindex="-1">
          <Play size={18} strokeWidth={2} />
          Play
        </button>
      </div>
    </div>
    <div class="dots">
      {#each items as _, i}
        <button class="dot" class:active={i === current} on:click|stopPropagation={() => go(i)} tabindex="-1"
          aria-label={'slide ' + (i + 1)}></button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .hero {
    position: relative;
    width: 100%;
    height: 380px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--surface);
    display: block;
  }
  .hero:focus { border-color: var(--accent); transform: none; }
  .hero :global(.backdrop), .backdrop {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .backdrop-fallback {
    position: absolute;
    inset: 0;
  }
  .scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, rgba(16, 20, 28, 0.92) 0%, rgba(16, 20, 28, 0.55) 45%, rgba(16, 20, 28, 0.15) 100%);
  }
  .content {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 32px 36px;
    max-width: 46%;
  }
  .brand-row {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }
  .source {
    font-size: 11px;
    font-weight: 700;
    color: var(--bg);
    background: var(--live);
    border-radius: 4px;
    padding: 2px 8px;
  }
  .title {
    font-family: var(--font-display);
    font-size: 38px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
    margin: 0 0 8px;
  }
  .synopsis {
    color: var(--dim);
    font-size: 14px;
    line-height: 1.45;
    margin: 0 0 16px;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .actions { display: flex; }
  .play {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--text);
    color: var(--bg);
    font-weight: 600;
    font-size: 14px;
    border-radius: 8px;
    padding: 9px 18px;
    transition: transform var(--dur) var(--ease);
  }
  .play:hover { transform: scale(1.04); }
  .dots {
    position: absolute;
    right: 28px;
    bottom: 24px;
    display: flex;
    gap: 8px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 4px;
    background: rgba(232, 237, 242, 0.3);
    transition: background var(--dur) var(--ease), width var(--dur) var(--ease);
  }
  .dot.active { background: var(--text); width: 20px; }
</style>
