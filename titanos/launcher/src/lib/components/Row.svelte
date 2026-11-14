<script lang="ts">
  export let title: string;
</script>

<!-- .shelf on the section lets the spatial engine dim non-focused shelves
     (see app.css). Track bleeds to the screen edge while resting cards start
     inside the safe area. -->
<section class="shelf row">
  <h2>{title}</h2>
  <div class="track">
    <slot />
  </div>
</section>

<style>
  .row h2 {
    font-family: var(--font-display);
    font-size: var(--fs-title);
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 0 0 12px;
  }
  .track {
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
    scroll-padding-inline: var(--safe-x);
    /* headroom so the focused card's scale growth never clips */
    padding: 10px var(--safe-x) 12px;
    margin: -10px calc(-1 * var(--safe-x)) -12px;
  }
  .track::-webkit-scrollbar { display: none; }
</style>
