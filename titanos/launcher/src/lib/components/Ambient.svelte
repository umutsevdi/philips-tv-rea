<script lang="ts">
  /* Fixed ambient wash behind the glass surfaces. Static deep gradients with
     an ultra-slow transform drift — transform only, minutes long, and killed
     entirely by prefers-reduced-motion. Never touched on the keypress path. */
</script>

<div class="ambient" aria-hidden="true">
  <div class="wash ember"></div>
  <div class="wash teal"></div>
  <div class="vignette"></div>
</div>

<style>
  .ambient {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    overflow: hidden;
    background: var(--bg);
    z-index: -1;
  }
  .wash {
    position: absolute;
    width: 140%;
    height: 140%;
    left: -20%;
    top: -20%;
  }
  .ember {
    background: radial-gradient(48% 42% at 24% 12%, rgba(242, 163, 60, 0.16), transparent 70%);
    animation: drift 140s ease-in-out infinite alternate;
  }
  .teal {
    background: radial-gradient(52% 46% at 80% 86%, rgba(83, 210, 225, 0.12), transparent 70%);
    animation: drift 180s ease-in-out infinite alternate-reverse;
  }
  .vignette {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background: radial-gradient(90% 90% at 50% 40%, transparent 55%, rgba(6, 8, 12, 0.5) 100%);
  }
  @keyframes drift {
    from { transform: translate3d(-2%, -1%, 0) scale(1); }
    to { transform: translate3d(2%, 2%, 0) scale(1.06); }
  }
  @media (prefers-reduced-motion: reduce) {
    .ember, .teal { animation: none; }
  }
</style>
