<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import TopBar from './lib/components/TopBar.svelte';
  import Row from './lib/components/Row.svelte';
  import Hero from './lib/components/Hero.svelte';
  import AppTile from './lib/components/AppTile.svelte';
  import Card from './lib/components/Card.svelte';
  import ChannelCard from './lib/components/ChannelCard.svelte';
  import Ambient from './lib/components/Ambient.svelte';
  import Skeleton from './lib/components/Skeleton.svelte';
  import Dialog from './lib/components/Dialog.svelte';
  import StoreTile from './lib/components/StoreTile.svelte';
  import AppsScreen from './lib/components/AppsScreen.svelte';
  import { actionFor, hotkeyFor, LongPress } from './lib/bridge/keys';
  import type { Action } from './lib/bridge/keys';
  import * as nav from './lib/nav/spatial';
  import { notifyVersion, hasFirmware } from './lib/bridge/device';
  import { fetchHome, specFromDeeplink } from './lib/api/titan';
  import type { PageList, Tile, ContentItem } from './lib/api/titan';
  import { DEMO_HERO, DEMO_ROWS } from './lib/api/demo';
  import { channels as fetchChannels } from './lib/api/tv';
  import type { TvChannel } from './lib/api/tv';
  import { pins, togglePin } from './lib/apps/pins';
  import { loadCatalog, catalogFallback } from './lib/apps/catalog';
  import { launch } from './lib/launch/dispatch';
  import tilesJson from '../tiles.json';

  /* Backend flag: demo until TV token flow verified (U4); flip to real data behind this. */
  const USE_BACKEND = false;

  /* App catalog: loaded async (backend /me/apps + device FVP inventory,
     catalog.json fallback). Rendered immediately from the fallback so the
     first paint is never empty. */
  let catalog: Tile[] = catalogFallback;
  let baseTiles: Tile[] = (tilesJson as { tiles: Tile[] }).tiles;

  let heroItems: ContentItem[] = [];
  let contentRows: { title: string; items: ContentItem[] }[] = [];
  let channelList: TvChannel[] = [];
  let loaded = false;
  let demoNow: Record<string, string> = {};

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

  $: pinnedApps = $pins.ids
    .map((id) => catalog.find((c) => c.id === id))
    .filter((t): t is Tile => !!t);
  $: allTiles = [...baseTiles, ...pinnedApps];
  $: favorites = allTiles.filter((t) => t.launch.kind !== 'local-ui');
  $: utilities = allTiles.filter((t) => t.launch.kind === 'local-ui');

  /* 6 tiles fit one safe-area row exactly: 6*172px + 5*24px = 1152px.
     Tiles are balanced across the rows (store tile included in the count,
     always last) so stretch fills every row flush; overflow beyond two
     rows lives in the store, where pinned apps can be removed. */
  const APPS_PER_ROW = 6;
  $: totalTiles = favorites.length + 1; // + the store tile
  $: rowCount = Math.min(2, Math.ceil(totalTiles / APPS_PER_ROW));
  $: perRow = Math.min(APPS_PER_ROW, Math.ceil(totalTiles / rowCount));
  $: appRow1 = favorites.slice(0, perRow);
  $: appRow2 = favorites.slice(perRow, APPS_PER_ROW * 2 - 1);

  /* Showcase shows (all demo/backend rows flattened) render as the "On now"
     row; live channels get their own "Watch live" row below it. */
  $: showcaseItems = contentRows.flatMap((r) => r.items);

  function showDemo() {
    if (!heroItems.length) heroItems = DEMO_HERO;
    if (!channelList.length) {
      channelList = [
        { id: 1, number: 1, name: 'BBC One', logo: '' },
        { id: 2, number: 2, name: 'BBC Two', logo: '' },
        { id: 3, number: 3, name: 'ITV 1', logo: '' },
        { id: 4, number: 4, name: 'Channel 4', logo: '' },
        { id: 101, number: 101, name: 'CBBC', logo: '' },
        { id: 201, number: 201, name: 'Sky News', logo: '' },
        { id: 301, number: 301, name: 'Eurosport', logo: '' },
      ];
      demoNow = {
        '1': 'Match of the Day', '2': 'Frozen Planet', '3': 'The Chase',
        '4': 'Grand Designs', '101': 'Blue Peter', '201': 'Breaking News',
        '301': 'Cycling: Tour Highlights',
      };
    }
    if (!contentRows.length) {
      contentRows = DEMO_ROWS.map((r) => ({ title: r.title ?? 'On now', items: r.items ?? [] }));
    }
  }

  onMount(async () => {
    notifyVersion('0.1.0-poc');
    catalog = await loadCatalog();

    if (new URLSearchParams(location.search).has('instant')) {
      showDemo();
      loaded = true;
      setTimeout(() => { if (!nav.restoreLast()) nav.focusFirst(); }, 0);
      return;
    }

    if (USE_BACKEND) {
      const home = await fetchHome();
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
            contentRows = [...contentRows, { title: list.title ?? 'For you', items: list.items.slice(0, 12) }];
          }
        }
      }
    } else {
      showDemo();
    }

    const chans = await fetchChannels();
    if (chans?.length) {
      channelList = chans.slice(0, 20);
      demoNow = {}; // real EPG data arrives with a healthy TV daemon
    }

    loaded = true;
    setTimeout(() => { if (!nav.restoreLast()) nav.focusFirst(); }, 0);
  });

  const lp = new LongPress((a) => {
    if (a === 'down') nav.move('down');
  });

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

<svelte:window on:keydown={onKeyDown} on:keyup={onKeyUp} />

<Ambient />

<div class="view" class:hidden={view !== 'home'}>
  <TopBar {utilities} />

  {#if loaded}
    <div class="rows">
      <div class="shelf">
        {#if heroItems.length}
          <Hero items={heroItems} />
        {/if}
        <div class="quick-row">
          {#each appRow1 as tile (tile.id)}
            <AppTile {tile} row={0} />
          {/each}
          {#if totalTiles <= APPS_PER_ROW}
            <StoreTile onopen={openApps} />
          {/if}
        </div>
        {#if totalTiles > APPS_PER_ROW}
          <div class="quick-row second">
            {#each appRow2 as tile (tile.id)}
              <AppTile {tile} row={0} />
            {/each}
            <StoreTile onopen={openApps} />
          </div>
        {/if}
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
            <ChannelCard channel={ch} row={2} nowPlaying={demoNow[String(ch.id)] ?? null} />
          {/each}
        </Row>
      {/if}
    </div>
  {:else}
    <Skeleton />
  {/if}
</div>

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

{#if !hasFirmware()}
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
  /* Stretch app tiles so every row ends flush at the safe-area edge even
     when it holds fewer than 6 tiles: flex-basis is the tile's own 172px,
     free space is shared equally, capped at the span-3 card width. Higher
     specificity than the tile's own rule, so this wins on the home row. */
  .quick-row :global(.app-tile),
  .quick-row :global(.store-tile) {
    flex: 1 1 auto;
    max-width: var(--span-3);
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
