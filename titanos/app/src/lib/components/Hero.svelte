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
  let artFailed = false;

  $: item = items[current];
  $: backdrop = item?.images?.artwork_landscape ?? '';
  $: if (item) artFailed = false; // fresh slide, retry its art

  function next() { if (!paused && items.length) current = (current + 1) % items.length; }

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
  aria-label={item ? item.title : 'Featured'}
  on:click={open}
  on:keydown={(e) => e.key === 'Enter' && open()}
  on:mouseenter={() => (paused = true)}
  on:mouseleave={() => (paused = false)}
>
  {#if item}
    {#key backdrop || item.id}
      {#if backdrop && !artFailed}
        <img class="backdrop" src={backdrop} alt="" loading="lazy" decoding="async" on:error={() => (artFailed = true)} />
      {:else}
        <div class="backdrop-fallback" style:background={gradFor(item.id)}></div>
      {/if}
    {/key}
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
      <!-- decorative affordance; the hero itself is the activation target -->
      <div class="play" aria-hidden="true">
        <Play size={18} strokeWidth={2} />
        Play
      </div>
    </div>
    <div class="dots">
      {#each items as _, i}
        <span class="dot" class:active={i === current}></span>
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
    text-align: left;
  }
  .hero:global(.focused) {
    background: var(--glass-2);
  }
  .backdrop {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    animation: fade var(--dur-max) var(--ease);
  }
  .backdrop-fallback {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    animation: fade var(--dur-max) var(--ease);
  }
  .scrim {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background: linear-gradient(90deg, rgba(11, 14, 20, 0.88) 0%, rgba(11, 14, 20, 0.5) 45%, rgba(11, 14, 20, 0.12) 100%);
  }
  .content {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 32px 36px;
    max-width: 52%;
  }
  .brand-row {
    display: flex;
    margin-bottom: 10px;
  }
  .source + .source { margin-left: 8px; }
  .source {
    font-size: var(--fs-caption);
    font-weight: 500;
    color: var(--text);
    background: var(--glass-2);
    border-radius: 999px;
    padding: 3px 10px;
  }
  .title {
    font-family: var(--font-display);
    font-size: var(--fs-display);
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: var(--lh-tight);
    margin: 0 0 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .synopsis {
    color: var(--dim);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    margin: 0 0 16px;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .play {
    display: flex;
    align-items: center;
    align-self: flex-start;
    background: var(--text);
    color: var(--bg);
    font-weight: 600;
    font-size: var(--fs-label);
    border-radius: 999px;
    padding: 8px 18px;
  }
  /* icon/text spacing without flex gap (unverified on this build) */
  .play :global(svg) { margin-right: 8px; }
  /* second focus cue (with the amber ring): the affordance pill lights up */
  .hero:global(.focused) .play {
    background: var(--accent);
    color: var(--bg);
  }
  .dots {
    position: absolute;
    right: 28px;
    bottom: 24px;
    display: flex;
  }
  .dot + .dot { margin-left: 8px; }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 4px;
    background: rgba(232, 237, 242, 0.3);
  }
  .dot.active { width: 20px; background: var(--text); }

  @keyframes fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
