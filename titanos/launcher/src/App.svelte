<script lang="ts">
  import { onMount } from 'svelte';
  import TopBar from './lib/components/TopBar.svelte';
  import Row from './lib/components/Row.svelte';
  import Hero from './lib/components/Hero.svelte';
  import AppTile from './lib/components/AppTile.svelte';
  import Card from './lib/components/Card.svelte';
  import ChannelCard from './lib/components/ChannelCard.svelte';
  import { actionFor, LongPress } from './lib/bridge/keys';
  import * as nav from './lib/nav/spatial';
  import { notifyVersion, hasFirmware } from './lib/bridge/device';
  import { fetchHome } from './lib/api/titan';
  import { specFromDeeplink } from './lib/api/titan';
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
    setTimeout(() => {
      switch (action) {
        case 'up': case 'down': case 'left': case 'right':
          nav.move(action);
          break;
        case 'enter': {
          const f = nav.focused();
          (f?.el as HTMLButtonElement | undefined)?.click();
          break;
        }
        case 'back':
          if (!nav.goBack()) console.info('[nav] at top of stack');
          break;
        case 'ch-up': nav.move('right'); break;
        case 'ch-down': nav.move('left'); break;
        default:
          console.info(`[keys] ${action} (unmapped in PoC)`);
      }
    }, 0);
  }
  function onKeyUp() { lp.stop(); }
</script>

<svelte:window on:keydown={onKeyDown} on:keyup={onKeyUp} />

<div class="shell">
  <TopBar {utilities} />

  {#if loaded}
    <div class="rows">
      {#if heroItems.length}
        <Hero items={heroItems} />
        <div class="quick-row">
          {#each favorites as tile (tile.id)}
            <AppTile {tile} row={0} />
          {/each}
        </div>
      {/if}

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
    <div class="loading">Loading…</div>
  {/if}

  {#if !hasFirmware()}
    <div class="mock-banner">Desktop mode — firmware bridges mocked</div>
  {/if}
</div>

<style>
  .shell {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .rows {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px 28px 28px;
    scrollbar-width: none;
  }
  .rows::-webkit-scrollbar { display: none; }
  .quick-row {
    display: flex;
    gap: 14px;
    margin: 18px 0 8px;
  }
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--faint);
  }
  .mock-banner {
    position: fixed;
    right: 12px;
    bottom: 12px;
    font-size: 11px;
    color: var(--faint);
    background: var(--surface);
    border-radius: 6px;
    padding: 4px 8px;
  }
</style>
