<script lang="ts">
  export let title: string;
</script>

<section class="row">
  <h2>{title}</h2>
  <div class="track">
    <slot />
  </div>
</section>

<style>
  .row h2 {
    font-family: var(--font-display);
    font-size: 19px;
    font-weight: 600;
    margin: 0 0 12px 0;
    letter-spacing: -0.01em;
  }
  .track {
    display: flex;
    gap: 14px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
  }
  .track::-webkit-scrollbar { display: none; }
</style>
