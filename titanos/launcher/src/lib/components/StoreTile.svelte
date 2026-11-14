<script lang="ts">
  /* Terminating tile of the app rows: switches to the Apps screen.
     Distinct by icon + label (never colour-only); focus cue is the standard
     amber ring + scale. */
  import { onMount } from 'svelte';
  import { LayoutGrid } from '@lucide/svelte';
  import { register, unregister } from '../nav/spatial';

  export let onopen: () => void = () => {};
  let el: HTMLElement;

  onMount(() => {
    register({ id: 'store', el, row: 0, col: -1 });
    return () => unregister('store');
  });
</script>

<button bind:this={el} class="focusable store-tile" tabindex="-1" aria-label="All apps" on:click={onopen}>
  <LayoutGrid size={40} strokeWidth={1.5} color="var(--dim)" />
  <div class="name">All apps</div>
</button>

<style>
  .store-tile {
    width: var(--span-2);
    height: 112px;
    border-radius: var(--radius-tile);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--text);
  }
  .store-tile:global(.focused) {
    transform: scale(var(--scale-icon));
    background: var(--glass-2);
  }
  .name {
    margin-top: 10px;
    font-size: var(--fs-label);
    font-weight: 500;
    color: var(--dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .store-tile:global(.focused) .name { color: var(--text); }
</style>
