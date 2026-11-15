<script lang="ts">
  import { onMount } from 'svelte';
  import type { Action, ActionReturn } from 'svelte/action';
  import { Wifi, WifiOff, Settings, RadioReceiver, Calendar, Folder, Globe, List } from '@lucide/svelte';
  import Clock from './Clock.svelte';
  import { deviceInfo, loadLocalUI } from '../bridge/device';
  import { register, unregister } from '../nav/spatial';
  import type { Tile } from '../api/titan';

  export let utilities: Tile[] = [];
  /* Registration namespace: both views can host a TopBar without their
     elements clobbering each other in the spatial registry. */
  export let idPrefix = '';

  let online = navigator.onLine;
  const setOnline = () => (online = navigator.onLine);
  onMount(() => {
    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOnline);
    return () => {
      window.removeEventListener('online', setOnline);
      window.removeEventListener('offline', setOnline);
    };
  });
  $: info = deviceInfo();

  const iconMap: Record<string, any> = { Settings, RadioReceiver, Calendar, Folder, Globe, List };

  function open(tile: Tile) {
    if (tile.launch.kind === 'local-ui') loadLocalUI(tile.launch.uiId);
  }

  // Top-bar buttons participate in spatial navigation as row -1.
  const utilAction: Action<HTMLElement, { tile: Tile; index: number }> = (el, params): ActionReturn<{ tile: Tile; index: number }> => {
    register({ id: idPrefix + 'util:' + params.tile.id, el, row: -1, col: params.index });
    return { destroy: () => unregister(idPrefix + 'util:' + params.tile.id) };
  };
</script>

<header>
  <div class="left">
    <Clock />
    {#if info.model}
      <span class="divider" aria-hidden="true"></span>
      <span class="meta">{info.model}</span>
    {/if}
  </div>
  <div class="right">
    {#if online}
      <span class="status" aria-label="Online">
        <Wifi size={18} strokeWidth={1.75} />
      </span>
    {:else}
      <span class="status offline" role="status" aria-live="polite">
        <WifiOff size={14} strokeWidth={2} />
        Offline
      </span>
    {/if}
    {#each utilities as tile, i (tile.id)}
      {@const Icon = iconMap[tile.icon ?? ''] ?? Settings}
      <button
        class="focusable util"
        id={idPrefix + 'util:' + tile.id}
        use:utilAction={{ tile, index: i }}
        tabindex="-1"
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
    padding: var(--safe-y) var(--safe-x) 0;
  }
  .left,
  .right {
    display: flex;
    align-items: center;
  }
  .right > * + * { margin-left: 14px; }
  /* Explicit margins, not `.left > * + *`: Svelte scopes that combinator,
     and the element preceding the divider is the Clock component's own
     <span> (different scope) — the rule silently never matched, which is
     why the divider sat flush against the clock. */
  .divider {
    width: 1px;
    height: 16px;              /* matches the meta's 12px/1.4 text box */
    margin: 0 14px 6px;        /* same 6px bottom inset as .meta */
    background: var(--faint);
    opacity: 0.4;
    align-self: flex-end;      /* share the meta's baseline, not the clock's centre */
  }
  .meta {
    font-size: var(--fs-caption);
    color: var(--faint);
    align-self: flex-end;
    padding-bottom: 6px;
  }
  .status {
    display: flex;
    align-items: center;
    color: var(--faint);
  }
  .status.offline :global(svg) { margin-right: 6px; }
  .status.offline {
    font-size: var(--fs-caption);
    font-weight: 500;
    letter-spacing: 0.04em;
    color: var(--accent);
    background: var(--accent-soft);
    border-radius: 999px;
    padding: 4px 10px;
  }
  .util {
    width: 44px;
    height: 44px;
    border-radius: var(--radius);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--dim);
    transition: color var(--dur-in) var(--ease);
  }
  .util:global(.focused) {
    transform: scale(var(--scale-icon));
    background: var(--glass-2);
    color: var(--text);
  }
  .util:global(.focused):hover { background: var(--glass-2); }
</style>
