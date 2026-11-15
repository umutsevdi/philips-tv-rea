<script lang="ts">
  /* Own component so the 30 s tick never re-renders the TopBar tree (skill §8). */
  import { onMount } from 'svelte';
  let now = new Date();
  onMount(() => {
    const t = setInterval(() => { now = new Date(); }, 30000);
    return () => clearInterval(t);
  });
  $: date = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  $: time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
</script>

<span class="clock-group">
  <span class="clock">{time}</span>
  <span class="date">{date}</span>
</span>

<style>
  .clock-group {
    display: flex;
    align-items: baseline;
  }
  .date { margin-left: 10px; }
  /* Clock is display-size per TopBar spec; tabular-nums stops digit jitter. */
  .clock {
    font-family: var(--font-display);
    font-size: var(--fs-display);
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    line-height: var(--lh-tight);
  }
  .date {
    font-size: var(--fs-label);
    font-weight: 500;
    color: var(--dim);
  }
</style>
