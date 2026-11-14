<script lang="ts">
  import { onMount } from 'svelte';
  import TopBar from './lib/components/TopBar.svelte';
  import Row from './lib/components/Row.svelte';
  import Hero from './lib/components/Hero.svelte';
  import AppTile from './lib/components/AppTile.svelte';
  import Card from './lib/components/Card.svelte';
  import ChannelCard from './lib/components/ChannelCard.svelte';
  import Ambient from './lib/components/Ambient.svelte';
  import Skeleton from './lib/components/Skeleton.svelte';
  import Dialog from './lib/components/Dialog.svelte';
  import { actionFor, LongPress } from './lib/bridge/keys';
  import type { Action } from './lib/bridge/keys';
  import * as nav from './lib/nav/spatial';
  import { notifyVersion, hasFirmware } from './lib/bridge/device';
  import { fetchHome, specFromDeeplink } from './lib/api/titan';
  import type { PageList, Tile, ContentItem } from './lib/api/titan';
  import { DEMO_HERO, DEMO_ROWS } from './lib/api/demo';
  import { channels as fetchChannels } from './lib/api/tv';
  import type { TvChannel } from './lib/api/tv';
  import tilesJson from '../tiles.json';

  let allTiles: Tile[] = (tilesJson as { tiles: Tile[] }).tiles;
  let heroItems: ContentItem[] = [];
  let contentRows: { title: string; items: ContentItem[] }[] = [];
  let channelList: TvChannel[] = [];
  let loaded = false;
  let demoNow: Record<string, string> = {};
  let dialogOpen = false;
  let dialogReturn: string | null = null;
  let keyScheduled = false;
  // Backend flag: demo until TV token flow verified (U4); flip to real data behind this.
  const USE_BACKEND = false;

  $: favorites = allTiles.filter((t) => t.launch.kind !== 'local-ui');
  $: utilities = allTiles.filter((t) => t.launch.kind === 'local-ui');

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
      contentRows = DEMO_ROWS.map((r) => ({ title: r.title ?? 'More to watch', items: r.items ?? [] }));
    }
  }

  onMount(async () => {
    notifyVersion('0.1.0-poc');

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
            allTiles = [...backend, ...allTiles.filter((t) => !seen.has(t.id))];
          } else if (list.items?.length) {
            contentRows = [...contentRows, { title: list.title ?? 'For you', items: list.items.slice(0, 20) }];
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
    const action = actionFor(e);
    if (!action) return;
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
    if (dialogOpen) {
      if (action === 'enter') nav.focused()?.el.click();
      else if (action === 'back' || action === 'backspace') closeDialog(false);
      else if (['up', 'down', 'left', 'right'].includes(action)) nav.move(action as 'up' | 'down' | 'left' | 'right');
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
        if (!nav.goBack()) openDialog(); // at root: ask before exiting
        break;
      case 'ch-up': nav.move('right'); break;
      case 'ch-down': nav.move('left'); break;
      default:
        console.info(`[keys] ${action} (unmapped in PoC)`);
    }
  }

  function openDialog(): void {
    dialogReturn = nav.focused()?.id ?? null;
    dialogOpen = true;
  }
  function closeDialog(confirmed: boolean): void {
    dialogOpen = false;
    nav.setModal(null);
    if (confirmed) {
      try { window.close(); } catch { /* not permitted — TV standby path later */ }
      return;
    }
    if (dialogReturn && nav.get(dialogReturn)) nav.focus(dialogReturn, false);
    else nav.focusFirst();
  }
</script>

<svelte:window on:keydown={onKeyDown} on:keyup={onKeyUp} />

<Ambient />

<div class="shell">
  <TopBar {utilities} />

  {#if loaded}
    <div class="rows">
      <div class="shelf hero-shelf">
        {#if heroItems.length}
          <Hero items={heroItems} />
        {/if}
        <div class="quick-row">
          {#each favorites as tile (tile.id)}
            <AppTile {tile} row={0} />
          {/each}
        </div>
      </div>

      {#each contentRows as row, i}
        <Row title={row.title}>
          {#each row.items as item (item.id)}
            <Card {item} row={i + 1} />
          {/each}
        </Row>
      {/each}

      {#if channelList.length}
        <Row title="Watch live">
          {#each channelList as ch (ch.id)}
            <ChannelCard channel={ch} row={contentRows.length + 2} nowPlaying={demoNow[String(ch.id)] ?? null} />
          {/each}
        </Row>
      {/if}
    </div>
  {:else}
    <Skeleton />
  {/if}
</div>

<Dialog open={dialogOpen} oncancel={() => closeDialog(false)} onconfirm={() => closeDialog(true)} />

{#if !hasFirmware()}
  <div class="mock-banner">Desktop mode — firmware bridges mocked</div>
{/if}

<style>
  .shell {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
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
