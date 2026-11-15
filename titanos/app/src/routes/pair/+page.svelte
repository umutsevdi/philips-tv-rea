<script lang="ts">
  export let data;
  export let form;
</script>

<div class="pair">
  <h1>Pair with the TV</h1>
  {#if data.paired}
    <p class="ok">TV already paired (host: <code>{data.host}</code>).</p>
    <p>You can re-pair to replace the stored credentials.</p>
  {/if}
  {#if form?.success}
    <p class="ok">Paired! The launcher can now use the TV API.</p>
  {:else}
    <form method="POST">
      <label>
        TV IP address
        <input name="host" value={form?.host ?? data.host} placeholder="192.168.1.239" required />
      </label>
      <label>
        PIN shown on the TV
        <input name="pin" inputmode="numeric" maxlength="4" placeholder="1234" required />
      </label>
      {#if form?.error}<p class="err">{form.error}</p>{/if}
      <button type="submit">Pair</button>
    </form>
    <p class="hint">
      Press OK on the TV screen when it shows the PIN (the remote's OK, or
      the TV's own confirmation dialog). This page runs on your Pi — the
      TV never types anything except confirming its own PIN.
    </p>
  {/if}
</div>

<style>
  .pair { max-width: 420px; margin: 10vh auto; font-family: system-ui, sans-serif; color: #e8edf2; }
  h1 { font-size: 1.4rem; }
  form { display: flex; flex-direction: column; gap: 14px; }
  label { display: flex; flex-direction: column; gap: 6px; }
  input { padding: 10px; border-radius: 8px; border: 1px solid #3a4553; background: #1a2029; color: #e8edf2; }
  button { padding: 12px; border-radius: 8px; border: 0; background: #f2a33c; color: #10141c; font-weight: 600; cursor: pointer; }
  .ok { color: #7ec26a; }
  .err { color: #e05d5d; }
  .hint { color: #8a94a6; font-size: 0.9rem; }
</style>
