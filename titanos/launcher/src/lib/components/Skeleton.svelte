<script lang="ts">
  /* Loading state in final geometry (skill §10): glass placeholders that match
     the real layout exactly — hero, app row, two content rows. Static, no
     shimmer loop. Rendered immediately at mount; content swaps it out. */
  const appTiles = Array.from({ length: 6 });
  const cardRows = Array.from({ length: 2 });
  const cards = Array.from({ length: 6 });
</script>

<div class="skeleton" aria-hidden="true">
  <section class="shelf">
    <div class="hero block"></div>
    <div class="quick-row">
      {#each appTiles as _, i (i)}
        <div class="tile block"></div>
      {/each}
    </div>
  </section>
  {#each cardRows as _, r (r)}
    <section class="shelf row">
      <div class="row-title block"></div>
      <div class="track">
        {#each cards as __, c (c)}
          <div class="card block">
            <div class="art"></div>
            <div class="label"></div>
          </div>
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .skeleton {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 16px 0 var(--safe-y);
  }
  .block { background: var(--glass); border-radius: var(--radius-lg); }
  .shelf { padding-inline: var(--safe-x); }
  .hero { height: 380px; }
  .quick-row {
    display: flex;
    margin-top: 20px;
  }
  .tile {
    width: var(--span-2);
    height: 112px;
    flex-shrink: 0;
    border-radius: var(--radius-tile);
  }
  .row-title {
    width: 140px;
    height: 20px;
    border-radius: 6px;
    margin-bottom: 12px;
  }
  .track {
    display: flex;
    overflow: hidden;
  }
  .card {
    width: var(--span-3);
    flex-shrink: 0;
    border-radius: var(--radius);
    overflow: hidden;
  }
  .art {
    width: 100%;
    height: 152px;
    background: var(--glass-2);
  }
  @supports (aspect-ratio: 16 / 9) {
    .art { height: auto; aspect-ratio: 16 / 9; }
  }
  .label {
    height: 22px;
    margin: 10px 12px 12px;
    border-radius: 6px;
    background: var(--glass-2);
  }
</style>
