<!-- Full-screen Nextcloud media viewer (plan R4-R6). Image list walking,
     server-resized full view, next/prev preload only, 6 s slideshow
     (green key or long-press OK, any D-pad key stops), inline <video>
     for videos, info bar with tabular numerals. Keys arrive via the
     App-level handler through the exported api object (ncstate). -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { register, unregister } from '../nav/spatial';
  import { ncMediaUrl } from '../api/nextcloud';
  import type { NcEntry } from '../api/nextcloud';

  export let media: NcEntry[] = [];
  export let index = 0;
  export let onClose: () => void = () => {};

  const SLIDESHOW_MS = 6000;

  let current: NcEntry = media[index];
  let isVideo = false;
  let showInfo = false;
  let slideshow = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  $: current = media[index] ?? media[0];
  $: isVideo = /\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(current?.name ?? '');
  $: fullUrl = current ? ncMediaUrl(current.path, 1280, 720) : '';
  $: videoUrl = current ? ncMediaUrl(current.path) : '';
  $: prevUrl = media[index - 1] ? ncMediaUrl(media[index - 1].path, 1280, 720) : '';
  $: nextUrl = media[index + 1] ? ncMediaUrl(media[index + 1].path, 1280, 720) : '';

  function step(delta: number): void {
    stopSlideshow();
    index = Math.min(media.length - 1, Math.max(0, index + delta));
  }

  function toggleSlideshow(): void {
    if (slideshow) { stopSlideshow(); return; }
    slideshow = true;
    timer = setInterval(() => {
      if (index < media.length - 1) index++;
      else index = 0;
    }, SLIDESHOW_MS);
  }
  function stopSlideshow(): void {
    slideshow = false;
    if (timer) { clearInterval(timer); timer = null; }
  }

  /* A hidden focusable keeps the spatial engine's "one focused element"
     invariant inside the viewer; arrow keys are intercepted by the App
     handler before move() when the viewer is open. */
  let anchor: HTMLElement;
  const ANCHOR_ID = 'nc:viewer';
  onMount(() => {
    register({ id: ANCHOR_ID, el: anchor, row: 100, col: -1 });
    return () => { unregister(ANCHOR_ID); stopSlideshow(); };
  });

  /* Command surface for the App key handler. */
  export function api_key(action: string): boolean {
    if (action === 'back' || action === 'backspace') { stopSlideshow(); onClose(); return true; }
    if (isVideo) {
      if (action === 'enter') { stopSlideshow(); onClose(); return true; }
      return true; // video consumes everything else (native controls)
    }
    if (action === 'left') { step(-1); return true; }
    if (action === 'right') { step(1); return true; }
    if (action === 'enter') { showInfo = !showInfo; return true; }
    if (action === 'green') { toggleSlideshow(); return true; }
    return true; // viewer is modal: up/down/colours don't leak
  }
</script>

<div class="viewer">
  {#key fullUrl + videoUrl}
    {#if isVideo}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video class="media" src={videoUrl} controls autoplay></video>
    {:else}
      <img class="media" src={fullUrl} alt={current.name} />
    {/if}
  {/key}

  {#if prevUrl}<img class="preload" src={prevUrl} alt="" />{/if}
  {#if nextUrl}<img class="preload" src={nextUrl} alt="" />{/if}

  {#if showInfo && !isVideo}
    <div class="info">
      <span class="name">{current.name}</span>
      <span class="pos">{index + 1} / {media.length}</span>
    </div>
  {/if}
  {#if slideshow}
    <div class="ss">Slideshow — press any key to stop</div>
  {/if}

  <button bind:this={anchor} class="anchor" tabindex="-1" aria-hidden="true"></button>
</div>

<style>
  .viewer { position: fixed; inset: 0; background: #000; z-index: 40;
            display: flex; align-items: center; justify-content: center; }
  .media { max-width: 100%; max-height: 100%; object-fit: contain; }
  .preload { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  .info { position: absolute; left: var(--safe-x); bottom: var(--safe-y);
          display: flex; gap: 16px; align-items: baseline;
          padding: 10px 16px; border-radius: 10px; background: var(--glass);
          border: 1px solid var(--glass-border); }
  .name { font-size: var(--fs-body); font-weight: 500; color: var(--text); }
  .pos { font-size: var(--fs-caption); font-weight: 500; color: var(--dim);
         font-variant-numeric: tabular-nums; }
  .ss { position: absolute; right: var(--safe-x); bottom: var(--safe-y);
        font-size: var(--fs-caption); font-weight: 500; color: var(--dim); }
  .anchor { position: absolute; width: 1px; height: 1px; opacity: 0; }
</style>
