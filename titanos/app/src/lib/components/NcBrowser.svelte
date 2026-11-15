<!-- Nextcloud folder/photo browser (plan R2-R4, R8-R10). Rows of 6 like
     AppsScreen; folders first; images get server previews via the proxy;
     videos a play badge. All cards register with the spatial engine at
     row offsets unique to this view (scope='nc:'). Error and empty states
     are focusable rows — never a dead screen (R8). -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Folder, Image as ImageIcon, Play, AlertCircle } from '@lucide/svelte';
  import { register, unregister, setScope, focusWithin } from '../nav/spatial';
  import {
    ncList, ncRoot, ncLastPath, ncParent, ncMediaUrl, isImageEntry, isVideoEntry,
  } from '../api/nextcloud';
  import type { NcEntry } from '../api/nextcloud';

  export let onClose: () => void = () => {};

  let rootEl: HTMLElement;
  let path = ncLastPath() ?? ncRoot();  // restore last folder, else WebDAV root
  let entries: NcEntry[] = [];
  let loading = true;
  let authFailed = false;
  let notConfigured = false;
  let netFailed = false;
  let rateLimited = false;
  let loadedTick = 0;

  const PER_ROW = 6;
  function chunk(list: NcEntry[], size: number): NcEntry[][] {
    const out: NcEntry[][] = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  }
  $: rowCount = Math.max(1, Math.ceil(entries.length / PER_ROW));
  $: perRow = Math.min(PER_ROW, Math.ceil(entries.length / rowCount));
  $: rows = chunk(entries, perRow);
  $: crumbs = path === '/' ? [] : path.split('/').filter(Boolean);

  async function load(p: string, allowFallback = true): Promise<void> {
    loading = true;
    authFailed = notConfigured = netFailed = rateLimited = false;
    const res = await ncList(p);
    if (res.entries) {
      path = p;
      entries = res.entries;
    } else if (res.notFound && p !== ncRoot() && allowFallback) {
      // remembered folder was deleted/renamed: fall back to the root once
      await load(ncRoot(), false);
      return;
    } else {
      authFailed = res.authFailed;
      notConfigured = res.notConfigured;
      rateLimited = res.rateLimited;
      netFailed = !res.authFailed && !res.notConfigured && !res.rateLimited;
    }
    loading = false;
    loadedTick++;
  }

  /* Self-contained open: load on mount, scope the spatial engine to this
     view, land focus on the first card. The engine's focused element must
     live INSIDE this view — otherwise keys operate the hidden home screen
     (the "no navigation" bug). */
  onMount(() => {
    void load(path);   // starts at last folder (or root on first use)
    setScope(rootEl);
    // first card may not exist yet (async load); focusWithin retries below
    setTimeout(() => { if (!focusWithin(rootEl)) navRetryFocus(); }, 0);
  });
  let focusTries = 0;
  function navRetryFocus(): void {
    if (focusTries++ > 20) return;
    setTimeout(() => {
      if (!focusWithin(rootEl)) navRetryFocus();
    }, 100);
  }
  onDestroy(() => { setScope(null); })
  $: if (entries.length && rootEl) {
    // entries arrived after mount: ensure focus is inside this view
    setTimeout(() => { if (!focusWithin(rootEl)) focusWithin(rootEl); }, 0);
  }

  function enter(e: NcEntry): void {
    if (e.isDir) void load(e.path);
    else select(e);
  }

  function select(e: NcEntry): void {
    const media = entries.filter((x) => !x.isDir);
    const index = media.indexOf(e);
    onmedia && onmedia(media, index, path);
  }

  export let onmedia: ((media: NcEntry[], index: number, path: string) => void) | null = null;

  function up(): void {
    const parent = ncParent(path);
    if (parent) void load(parent);
    else onClose();
  }

  /** True when not at the WebDAV root — App uses this to decide whether Back
      pops one folder level (plan R2) or closes the browser. */
  export function canGoUp(): boolean {
    return ncParent(path) !== null;
  }
  export function goUp(): void { up(); }

  function retry(): void { void load(path); }

  /* Card registration via a Svelte action: id is stable per entry+slot,
     scope prefix 'nc:' keeps the registry clean; unregistered on destroy. */
  function reg(el: HTMLElement, params: { e: NcEntry; i: number; r: number }) {
    const { e, i, r } = params;
    const id = `nc:${path}:${i}:${e.name}`;
    register({ id, el, row: r, col: -1 });
    return { destroy() { unregister(id); } };
  }
</script>

<div class="nc" bind:this={rootEl}>
  <header class="top">
    <button class="focusable up" tabindex="-1" aria-label="Up one folder"
            on:click={up}>
      <Folder size={28} strokeWidth={1.5} color="var(--dim)" />
      <span class="crumbs">
        {#each crumbs as c, i (i)}
          {#if i}<span class="sep">/</span>{/if}
          <span class:dim={i < crumbs.length - 1}>{c}</span>
        {/each}
      </span>
    </button>
  </header>

  {#if loading}
    <div class="state">Loading…</div>
  {:else if authFailed || notConfigured || netFailed || rateLimited}
    <div class="state">
      <AlertCircle size={32} strokeWidth={1.5} color="var(--dim)" />
      <p>
        {#if authFailed}Nextcloud rejected the app password.
        {:else if rateLimited}Nextcloud is rate-limiting requests (429). Wait a
          minute, then retry — repeated failed logins trip its brute-force
          protection.
        {:else if notConfigured}Nextcloud is not configured (config.json).
        {:else}Nextcloud unreachable.{/if}
      </p>
      <button class="focusable retry" tabindex="-1" on:click={retry}>Retry</button>
    </div>
  {:else if !entries.length}
    <div class="state">
      <p>This folder is empty.</p>
      <button class="focusable retry" tabindex="-1" on:click={up}>Back</button>
    </div>
  {:else}
    <div class="page">
      {#each rows as rowEntries, r (r + ':' + loadedTick)}
        <div class="grid-row">
          {#each rowEntries as e (e.path)}
            <button class="focusable card" tabindex="-1"
                    aria-label={e.name}
                    use:reg={{ e, i: (r * perRow) + rowEntries.indexOf(e), r }}
                    on:click={() => enter(e)}>
              {#if e.isDir}
                <span class="plate"><Folder size={36} strokeWidth={1.5} color="var(--dim)" /></span>
              {:else if isImageEntry(e)}
                <img class="thumb" src={ncMediaUrl(e.path, 256, 256, true)} alt=""
                     loading="lazy" decoding="async"
                     on:error={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              {:else if isVideoEntry(e)}
                <span class="plate"><Play size={36} strokeWidth={1.5} color="var(--dim)" /></span>
                <span class="badge">VIDEO</span>
              {:else}
                <span class="plate"><ImageIcon size={36} strokeWidth={1.5} color="var(--dim)" /></span>
              {/if}
              <div class="name">{e.name}</div>
            </button>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .nc { position: absolute; inset: 0; background: var(--bg); display: flex; flex-direction: column; z-index: 30; }
  .top { padding: 24px var(--safe-x) 8px; }
  .up { display: flex; align-items: center; border-radius: var(--radius); padding: 8px 12px 8px 8px; }
  .crumbs { font-family: var(--font-display); font-size: var(--fs-title); font-weight: 600; color: var(--text); margin-left: 10px; }
  .crumbs .sep { margin: 0 8px; color: var(--faint); }
  .dim { color: var(--dim); }
  .page { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: none;
          padding: 8px var(--safe-x) var(--safe-y); }
  .page::-webkit-scrollbar { display: none; }
  .grid-row { display: flex; }
  .grid-row + .grid-row { margin-top: 24px; }
  .grid-row :global(.card), .grid-row .card { flex: 1 1 0; min-width: 0; }
  .card {
    border-radius: var(--radius-tile);
    padding: 12px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    position: relative;
  }
  .plate { width: 96px; height: 96px; border-radius: 12px; background: var(--surface-2);
           display: flex; align-items: center; justify-content: center; }
  .thumb { width: 120px; height: 120px; object-fit: cover; border-radius: 10px; }
  .badge { position: absolute; top: 16px; right: 16px; font-size: var(--fs-caption);
           font-weight: 500; color: var(--live); background: var(--live-soft);
           border-radius: 999px; padding: 2px 8px; }
  .name { margin-top: 10px; font-size: var(--fs-label); font-weight: 500; color: var(--dim);
          max-width: 90%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card:global(.focused) { transform: scale(var(--scale-icon)); background: var(--glass-2); }
  .card:global(.focused) .name { color: var(--text); }
  .state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
           gap: 16px; color: var(--dim); font-size: var(--fs-body); }
  .retry { border-radius: 999px; padding: 10px 32px; font-size: var(--fs-body); font-weight: 600;
           color: var(--text); background: var(--surface-2); }
</style>
