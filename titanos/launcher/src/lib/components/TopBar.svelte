<script lang="ts">
  import { onMount } from 'svelte';
  import type { Action, ActionReturn } from 'svelte/action';
  import { Wifi, WifiOff, Settings, RadioReceiver, Calendar, Folder, Globe, List } from '@lucide/svelte';
  import { deviceInfo, loadLocalUI } from '../bridge/device';
  import { register, unregister } from '../nav/spatial';
  import type { Tile } from '../api/titan';

  export let utilities: Tile[] = [];

  let now = new Date();
  let online = navigator.onLine;
  const setOnline = () => (online = navigator.onLine);
  onMount(() => {
    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOnline);
    const t = setInterval(() => { now = new Date(); }, 30000);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', setOnline);
      window.removeEventListener('offline', setOnline);
    };
  });
  $: date = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  $: time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $: info = deviceInfo();

  const iconMap: Record<string, any> = { Settings, RadioReceiver, Calendar, Folder, Globe, List };

  function open(tile: Tile) {
    if (tile.launch.kind === 'local-ui') loadLocalUI(tile.launch.uiId);
  }

  // Top-bar buttons participate in spatial navigation as row -1.
  const utilAction: Action<HTMLElement, { tile: Tile; index: number }> = (el, params): ActionReturn<{ tile: Tile; index: number }> => {
    register({ id: 'util:' + params.tile.id, el, row: -1, col: params.index });
    return { destroy: () => unregister('util:' + params.tile.id) };
  };
</script>

<header>
  <div class="left">
    <span class="time">{time}</span>
    <span class="date">{date}</span>
    <span class="divider"></span>
    {#if online}
      <Wifi size={20} strokeWidth={1.75} />
    {:else}
      <span class="offline"><WifiOff size={20} strokeWidth={1.75} /></span>
    {/if}
    <span class="meta">{info.model}</span>
  </div>
  <div class="right">
    {#each utilities as tile, i (tile.id)}
      {@const Icon = iconMap[tile.icon ?? ''] ?? Settings}
      <button
        class="focusable util"
        id={'util:' + tile.id}
        use:utilAction={{ tile, index: i }}
        tabindex="-1"
        title={tile.name}
        aria-label={tile.name}
        on:click={() => open(tile)}
      >
        <Icon size={20} strokeWidth={1.75} />
      </button>
    {/each}
  </div>
</header>

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 18px 28px 10px;
  }
  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 14px;
    color: var(--dim);
  }
  .time {
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 600;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .date {
    font-size: 15px;
    color: var(--dim);
  }
  .meta {
    font-size: 15px;
    color: var(--dim);
  }
  .divider {
    width: 1px;
    height: 20px;
    background: var(--faint);
    opacity: 0.4;
  }
  .util {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--dim);
    transition: color var(--dur) var(--ease), background-color var(--dur) var(--ease);
  }
  .util:hover { color: var(--text); background: var(--surface); }
  .util:focus {
    background: var(--surface);
    color: var(--text);
    border-color: var(--accent);
  }
</style>
