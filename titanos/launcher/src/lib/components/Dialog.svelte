<script lang="ts">
  /* Glass exit-confirm dialog (skill §12): focus-trapped via the spatial
     engine's modal scope, focus restored to the trigger on close. Enter
     activates the engine-focused button; back closes without exiting. */
  import { register, unregister, setModal, focusWithin } from '../nav/spatial';

  export let open = false;
  export let onconfirm: () => void = () => {};
  export let oncancel: () => void = () => {};

  /* Action-based activation: runs exactly when the dialog mounts, so the
     modal scope and initial focus (on "Stay") are deterministic. */
  const activate = (node: HTMLElement) => {
    setModal(node);
    focusWithin(node);
    return { destroy: () => setModal(null) };
  };

  const reg = (node: HTMLButtonElement, col: number) => {
    register({ id: 'dlg:' + col, el: node, row: 100, col });
    return { destroy: () => unregister('dlg:' + col) };
  };
</script>

{#if open}
  <div class="overlay" aria-hidden="true"></div>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-h" use:activate>
    <h2 id="dlg-h">Exit launcher?</h2>
    <p>Closing returns the TV to its native home screen.</p>
    <div class="actions">
      <button class="focusable stay" use:reg={0} on:click={oncancel}>Stay</button>
      <button class="focusable exit" use:reg={1} on:click={onconfirm}>Exit</button>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background: var(--scrim);
    animation: fade var(--dur-out) var(--ease);
  }
  .dialog {
    position: fixed;
    left: 50%;
    top: 50%;
    width: 520px;
    max-width: calc(100% - 2 * var(--safe-x));
    background: var(--surface);
    border: var(--ring) solid var(--glass-border);
    border-top-color: var(--glass-sheen);
    border-radius: var(--radius-lg);
    padding: 28px 32px;
    z-index: 20;
    transform: translate(-50%, -50%);
    animation: pop var(--dur-out) var(--ease);
  }
  .dialog h2 {
    font-family: var(--font-display);
    font-size: var(--fs-headline);
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: var(--lh-tight);
    margin: 0 0 10px;
  }
  .dialog p {
    font-size: var(--fs-body);
    color: var(--dim);
    line-height: var(--lh-body);
    margin: 0 0 24px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
  }
  .actions button + button { margin-left: 12px; }
  .actions button {
    min-width: 140px;
    height: 44px;
    border-radius: var(--radius);
    font-size: var(--fs-body);
    font-weight: 600;
  }
  .stay { background: var(--glass); }
  .stay:global(.focused) { background: var(--glass-2); }
  .exit { background: var(--accent-soft); }
  .exit:global(.focused) { background: var(--accent-soft); color: var(--accent); }

  @keyframes fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes pop {
    from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .overlay, .dialog { animation: none; }
  }
</style>
