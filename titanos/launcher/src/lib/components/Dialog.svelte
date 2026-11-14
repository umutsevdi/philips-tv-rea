<script lang="ts" context="module">
  export interface DialogOption {
    label: string;
    danger?: boolean;
    run: () => void;
  }
</script>

<script lang="ts">
  /* Glass dialog (skill §12): focus-trapped via the spatial engine's scope,
     focus restored to the trigger on close by the caller. Enter activates
     the engine-focused option; back closes via the caller's handler. */
  import { register, unregister, setScope, focusWithin } from '../nav/spatial';

  export let open = false;
  export let title = '';
  export let body = '';
  export let options: DialogOption[] = [];

  /* Action-based activation: runs exactly when the dialog mounts, so the
     scope and initial focus (first option — the safe default) are set. */
  const activate = (node: HTMLElement) => {
    setScope(node);
    focusWithin(node);
    return { destroy: () => setScope(null) };
  };

  const reg = (node: HTMLButtonElement, col: number) => {
    register({ id: 'dlg:' + col, el: node, row: 100, col });
    return { destroy: () => unregister('dlg:' + col) };
  };
</script>

{#if open}
  <div class="overlay" aria-hidden="true"></div>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-h" use:activate>
    <h2 id="dlg-h">{title}</h2>
    {#if body}
      <p>{body}</p>
    {/if}
    <div class="actions">
      {#each options as opt, i}
        <button class="focusable opt" class:danger={opt.danger} use:reg={i} on:click={opt.run}>
          {opt.label}
        </button>
      {/each}
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
    flex-wrap: wrap;          /* long labels (Remove from home) wrap, never overflow */
    justify-content: flex-end;
  }
  .actions button + button { margin-left: 12px; }
  .actions button {
    min-width: 120px;
    height: 44px;
    padding: 0 20px;          /* the base reset is 0; labels need side room */
    border-radius: var(--radius);
    font-size: var(--fs-body);
    font-weight: 600;
  }
  .opt { background: var(--glass); }
  .opt.danger { background: var(--accent-soft); }
  .opt:global(.focused) { background: var(--glass-2); }
  .opt.danger:global(.focused) { background: var(--accent-soft); color: var(--accent); }

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
