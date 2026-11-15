<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import TopBar from '$lib/components/TopBar.svelte';
  import Row from '$lib/components/Row.svelte';
  import Hero from '$lib/components/Hero.svelte';
  import AppTile from '$lib/components/AppTile.svelte';
  import Card from '$lib/components/Card.svelte';
  import ChannelCard from '$lib/components/ChannelCard.svelte';
  import Ambient from '$lib/components/Ambient.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import StoreTile from '$lib/components/StoreTile.svelte';
  import AppsScreen from '$lib/components/AppsScreen.svelte';
  import { actionFor, hotkeyFor, LongPress } from '$lib/bridge/keys';
  import type { Action } from '$lib/bridge/keys';
  import * as nav from '$lib/nav/spatial';
  import { notifyVersion, hasFirmware, isDesktopDev } from '$lib/bridge/device';
  import NcBrowser from '$lib/components/NcBrowser.svelte';
  import NcViewer from '$lib/components/NcViewer.svelte';
  import { nc, ncOpenBrowser, ncOpenViewer, ncCloseViewer, ncCloseAll } from '$lib/apps/ncstate';
  import { setNextcloudOpener } from '$lib/launch/dispatch';
  import { DEMO_HERO, DEMO_ROWS, DEMO_CHANNELS } from '$lib/api/demo';
  import { fetchHome, fetchOnNow, specFromDeeplink } from '$lib/api/titan';
  import type { PageList, Tile, ContentItem } from '$lib/api/titan';
  import { channels as fetchChannels } from '$lib/api/tv';
  import type { TvChannel } from '$lib/api/tv';
  import { pins, togglePin } from '$lib/apps/pins';
  import { loadCatalog, catalogFallback } from '$lib/apps/catalog';
  import { launch } from '$lib/launch/dispatch';
  import tilesJson from '../../tiles.json';

  /* Try-real-first boot (see onMount): no global flag — backend calls are
     token-gated and fail soft to demo data per source (U4). */
  /* App catalog: loaded async (backend /me/apps + device FVP inventory,
     catalog.json fallback). Rendered immediately from the fallback so the
     first paint is never empty. */
  let catalog: Tile[] = catalogFallback;
  let baseTiles: Tile[] = (tilesJson as { tiles: Tile[] }).tiles;

  let heroItems: ContentItem[] = [];
  let contentRows: PageList[] = [];
  let channelList: TvChannel[] = [];
  let loaded = false;

  /* View switching: home stays mounted (focus memory, scroll position),
     Apps mounts on demand. The spatial engine's scope confines D-pad moves
     to the visible view / open dialog. */
  let view: 'home' | 'apps' = 'home';
  let appsRoot: HTMLElement;
  let appsReturn: string | null = null;
  let dialogState: {
    title: string;
    body: string;
    options: { label: string; danger?: boolean; run: () => void }[];
  } | null = null;
  let dialogReturn: string | null = null;
  let keyScheduled = false;
  let ncBrowser: NcBrowser;
  let ncViewer: NcViewer;
  let ncReturn: string | null = null;
  $: ncView = $nc;

  $: pinnedApps = $pins.ids
    .map((id) => catalog.find((c) => c.id === id))
    .filter((t): t is Tile => !!t);
  $: allTiles = [...baseTiles, ...pinnedApps];
  $: favorites = allTiles.filter((t) => t.launch.kind !== 'local-ui');
  $: utilities = allTiles.filter((t) => t.launch.kind === 'local-ui');

  /* 6 tiles fit one safe-area row exactly: 6*172px + 5*24px = 1152px.
     Tiles are balanced across the rows (store tile included in the count,
     always last) so stretch fills every row flush. Any number of pinned
     apps renders — the rows container scrolls vertically; the spatial
     engine's row-banding resolves D-pad moves across however many rows
     exist. The last row is balanced by perRow so it never strands a
     lone tile (13 tiles → 5/5/3, not 6/6/1). */
  const APPS_PER_ROW = 6;
  $: totalTiles = favorites.length + 1; // + the store tile
  $: rowCount = Math.max(1, Math.ceil(totalTiles / APPS_PER_ROW));
  $: perRow = Math.min(APPS_PER_ROW, Math.ceil(totalTiles / rowCount));
  $: tileRows = chunk(favorites, perRow, rowCount);

  function chunk(list: Tile[], size: number, count: number): Tile[][] {
    const rows: Tile[][] = [];
    for (let i = 0; i < count; i++) rows.push(list.slice(i * size, (i + 1) * size));
    return rows;
  }

  /* Showcase shows (all demo/backend rows flattened) render as the "On now"
     row; live channels get their own "Watch live" row below it. */
  $: showcaseItems = contentRows.flatMap((r) => r.items ?? []);

  /* Desktop-dev filler ONLY — the isDesktopDev() gate at both call sites
     keeps the TV free of fake content: on the TV an empty row means "no
     real data", never "placeholder". */
  function showDemo() {
    if (!heroItems.length) heroItems = DEMO_HERO;
    if (!contentRows.length) contentRows = DEMO_ROWS.map((r) => ({ ...r, title: r.title ?? 'On now', items: r.items ?? [] }));
  }

  onMount(async () => {
    notifyVersion('0.1.0-poc');

    if (new URLSearchParams(location.search).has('instant')) {
      /* `?instant` = UI development shortcut; desktop-only by definition. */
      if (isDesktopDev()) showDemo();
      loaded = true;
      setTimeout(() => { if (!nav.restoreLast()) nav.focusFirst(); }, 0);
      return;
    }

    /* Try-real-first, demo fills the gaps (docs/04): every source below
       fails soft — backend calls return null without the firmware token
       (U4), the proxy's /api/channels returns null when the TV daemon is
       down — so missing infrastructure degrades to demo data, per source. */
    catalog = await loadCatalog(); // /me/apps + DEVICE_APPS → catalog.json

    const home = await fetchHome(); // /me/pages, token-gated
    const onNow = await fetchOnNow(); // /epg, token-gated: shows airing right now
    if (onNow.length) contentRows = [...onNow, ...contentRows];
    // hero: first strong item of the first content row, if any
    if (!heroItems.length && contentRows[0]?.items?.length) heroItems = contentRows[0].items.slice(0, 3);
    if (home) {
      for (const list of home) {
        if (list.type === 'apps_list' || list.type === 'favorites_list') {
          const backend = (list.items ?? []).map((item) => ({
            id: item.id,
            name: item.title ?? 'App',
            launch: item.deeplinkings?.[0]
              ? specFromDeeplink(item.deeplinkings[0])
              : { kind: 'deeplink' as const, url: item.deeplinking_url ?? '' },
          }));
          const seen = new Set(backend.map((t) => t.id));
          baseTiles = [...backend, ...baseTiles.filter((t) => !seen.has(t.id))];
        } else if (list.items?.length) {
          contentRows = [...contentRows, { ...list, title: list.title ?? 'For you', items: list.items.slice(0, 12) }];
        }
      }
    }

    const chans = await fetchChannels(); // proxy; dead daemon → demo on desktop only
    if (chans?.length) {
      channelList = chans.slice(0, 20);
    } else if (isDesktopDev()) {
      channelList = DEMO_CHANNELS;
    }

    if (isDesktopDev()) showDemo(); // desktop filler only; TV stays real-only

    loaded = true;
    setTimeout(() => { if (!nav.restoreLast()) nav.focusFirst(); }, 0);
  });

  const lp = new LongPress((a) => {
    if (a === 'down') nav.move('down');
  });

  /* Pointer-mode adapters: TV browser shells that drive a virtual cursor
     never deliver arrow keys, so hover becomes focus there (and on the
     desktop). Activation is the native click the browser already sends. */
  function onPointerOver(e: MouseEvent) {
    const el = e.target as HTMLElement | null;
    const hit = el && el.closest && el.closest('.focusable');
    if (hit) nav.hoverFocus(hit as HTMLElement);
  }

  function onKeyDown(e: KeyboardEvent) {
    /* Dedicated remote app keys (Netflix/YouTube/…) bypass navigation. */
    const hk = hotkeyFor(e);
    if (hk) {
      e.preventDefault();
      const tile = catalog.find((t) => t.id === hk);
      if (tile) launch(tile.launch);
      return;
    }
    const action = actionFor(e);
    if (!action) {
      if (!e.repeat) console.info('[keys] unknown key', { key: e.key, keyCode: e.keyCode });
      return;
    }
    e.preventDefault();
    lp.start(action);
    // Coalesce key repeats: drop anything arriving while one is in flight,
    // so held keys never queue an animation per repeat (skill §6/§7).
    if (keyScheduled) return;
    keyScheduled = true;
    setTimeout(() => { keyScheduled = false; handle(action); }, 0);
  }
  function onKeyUp() {
    lp.stop();
    nav.release();
  }

  function handle(action: Action): void {
    /* Nextcloud viewer is topmost (above the browser view). */
    if (ncView.open && !ncView.browser) {
      if (action === 'back' || action === 'backspace') { ncCloseViewer(); return; }
      if (action === 'left' || action === 'right') {
        ncViewer?.api_key?.(action); return;
      }
      if (action === 'enter') { ncViewer?.api_key?.('enter'); return; }
      return; // up/down don't leak from the viewer
    }
    if (ncView.open && ncView.browser) {
      if (action === 'back' || action === 'backspace') {
        if (ncBrowser?.canGoUp()) ncBrowser.goUp(); // Back pops one folder level (plan R2)
        else closeNc();
        return;
      }
      if (['up', 'down', 'left', 'right'].includes(action)) { nav.move(action as 'up' | 'down' | 'left' | 'right'); return; }
      if (action === 'enter') { nav.focused()?.el.click(); return; }
      return;
    }
    if (dialogState) {
      if (action === 'enter') nav.focused()?.el.click();
      else if (action === 'back' || action === 'backspace') closeDialog();
      else if (['up', 'down', 'left', 'right'].includes(action)) nav.move(action as 'up' | 'down' | 'left' | 'right');
      return;
    }
    if (view === 'apps') {
      if (['up', 'down', 'left', 'right'].includes(action)) nav.move(action as 'up' | 'down' | 'left' | 'right');
      else if (action === 'enter') nav.focused()?.el.click();
      else if (action === 'back' || action === 'backspace') closeApps();
      return;
    }
    switch (action) {
      case 'up': case 'down': case 'left': case 'right':
        nav.move(action);
        break;
      case 'enter': {
        nav.press();
        const f = nav.focused();
        (f?.el as HTMLButtonElement | undefined)?.click();
        break;
      }
      case 'back': case 'backspace':
        if (!nav.goBack()) openExitDialog(); // at root: ask before exiting
        break;
      case 'ch-up': nav.move('right'); break;
      case 'ch-down': nav.move('left'); break;
      default:
        console.info(`[keys] ${action} (unmapped in PoC)`);
    }
  }

  /* -- dialogs ---------------------------------------------------------- */

  function closeDialog(): void {
    dialogState = null;
    // Scope/focus restore after the dialog unmounts (its destroy action
    // clears the scope; re-assert ours on the next tick).
    setTimeout(() => {
      if (view === 'apps' && appsRoot) nav.setScope(appsRoot);
      else nav.setScope(null);
      if (dialogReturn && nav.get(dialogReturn)) nav.focus(dialogReturn, false);
    }, 0);
  }

  function openExitDialog(): void {
    dialogReturn = nav.focused()?.id ?? null;
    dialogState = {
      title: 'Exit launcher?',
      body: 'Closing returns the TV to its native home screen.',
      options: [
        { label: 'Stay', run: () => closeDialog() },
        { label: 'Exit', danger: true, run: () => { closeDialog(); try { window.close(); } catch { /* not permitted — TV standby path later */ } } },
      ],
    };
  }

  function openAppOptions(app: Tile): void {
    dialogReturn = nav.focused()?.id ?? null;
    const isPinned = get(pins).ids.includes(app.id);
    dialogState = {
      title: app.name,
      body: 'Open the app or manage it on your home screen.',
      options: [
        { label: 'Open', run: () => { closeDialog(); launch(app.launch); } },
        { label: isPinned ? 'Remove from home' : 'Pin to home', run: () => { closeDialog(); togglePin(app.id, app.name); } },
        { label: 'Cancel', run: () => closeDialog() },
      ],
    };
  }

  /* -- view switching ---------------------------------------------------- */

  function openNc(): void {
    ncReturn = nav.focused()?.id ?? null;
    ncOpenBrowser(); // NcBrowser mounts, loads, scopes the engine, takes focus
  }
  function closeNc(): void {
    ncCloseAll(); // NcBrowser destroy clears registrations + scope via App below
    setTimeout(() => {
      nav.setScope(null);
      if (ncReturn && nav.get(ncReturn)) nav.focus(ncReturn, false);
      else nav.focusFirst();
    }, 0);
  }
  setNextcloudOpener(openNc);

  function openApps(): void {
    appsReturn = nav.focused()?.id ?? null;
    view = 'apps';
    setTimeout(() => {
      if (appsRoot) {
        nav.setScope(appsRoot);
        nav.focusWithin(appsRoot);
      }
    }, 0);
  }

  function closeApps(): void {
    view = 'home';
    nav.setScope(null);
    setTimeout(() => {
      if (appsReturn && nav.get(appsReturn)) nav.focus(appsReturn, false);
      else nav.focusFirst();
    }, 0);
  }
</script>

<svelte:window on:keydown={onKeyDown} on:keyup={onKeyUp} on:mouseover={onPointerOver} />

<Ambient />

<div class="view" class:hidden={view !== 'home'}>
  <TopBar {utilities} />

  {#if loaded}
    <div class="rows">
      <div class="shelf">
        {#if heroItems.length}
          <Hero items={heroItems} />
        {/if}
        {#each tileRows as rowTiles, i (i)}
          <div class="quick-row" class:second={i > 0}>
            {#each rowTiles as tile (tile.id)}
              <AppTile {tile} row={i} />
            {/each}
            {#if i === tileRows.length - 1}
              <StoreTile onopen={openApps} />
            {/if}
          </div>
        {/each}
      </div>

      {#if showcaseItems.length}
        <Row title="On now">
          {#each showcaseItems as item (item.id)}
            <Card {item} row={1} />
          {/each}
        </Row>
      {/if}

      {#if channelList.length}
        <Row title="Watch live">
          {#each channelList as ch (ch.id)}
            <ChannelCard channel={ch} row={2} />
          {/each}
        </Row>
      {/if}
    </div>
  {:else}
    <Skeleton />
  {/if}
</div>

{#if ncView.open}
  {#if ncView.browser}
    <NcBrowser bind:this={ncBrowser} onClose={closeNc} onmedia={(media, index) => ncOpenViewer(media, index)} />
  {:else}
    <NcViewer bind:this={ncViewer} media={ncView.media} index={ncView.index}
              onClose={() => { ncCloseViewer(); }} />
  {/if}
{/if}

{#if view === 'apps'}
  <div class="view" bind:this={appsRoot}>
    <AppsScreen apps={catalog} {utilities} onselect={openAppOptions} />
  </div>
{/if}

<Dialog
  open={!!dialogState}
  title={dialogState?.title ?? ''}
  body={dialogState?.body ?? ''}
  options={dialogState?.options ?? []}
/>

{#if isDesktopDev()}
  <div class="mock-banner">Desktop mode — firmware bridges mocked</div>
{/if}

<style>
  .view {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .view.hidden { display: none; }
  .rows {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    /* single source of the safe-area inset; bleeding tracks compensate it.
       Inter-shelf spacing comes from the global margin rule in app.css
       (flex `gap` is unverified on this build). */
    padding: 16px var(--safe-x) var(--safe-y);
    scrollbar-width: none;
  }
  .rows::-webkit-scrollbar { display: none; }
  .quick-row {
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
    scroll-padding-inline: var(--safe-x);
    /* top margin is the visual hero→tiles gap; padding is focus-growth
       headroom; negative side margins bleed the track to the screen edge */
    padding: 10px var(--safe-x) 6px;
    margin: 12px calc(-1 * var(--safe-x)) -6px;
  }
  .quick-row::-webkit-scrollbar { display: none; }
  .quick-row.second { margin-top: 0; } /* row gap comes from its own paddings */
  /* Stretch app tiles so every row ends flush at the safe-area edge:
     flex-basis 0 gives the row's tiles equal shares of the full width
     (6 tiles → 172px, 5 → 211px, 4 → 270px, 3 → 368px). min-width: 0
     lets the ellipsising name shrink instead of forcing overflow. */
  .quick-row :global(.app-tile),
  .quick-row :global(.store-tile) {
    flex: 1 1 0;
    min-width: 0;
  }
  .mock-banner {
    position: fixed;
    right: 16px;
    bottom: 16px;
    font-size: var(--fs-caption);
    color: var(--faint);
    background: var(--glass);
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    padding: 4px 12px;
  }
</style>
