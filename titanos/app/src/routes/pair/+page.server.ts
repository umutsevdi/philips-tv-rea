import { fail } from '@sveltejs/kit';
import { loadCredentials, saveCredentials, setTv, loadTvHost, getTv } from '$lib/server/tv';

/* First-run pairing: the TV shows a PIN (firmware does this itself); the
   user types host + PIN HERE, in the browser on their laptop — never on
   the TV. Equivalent of the retired `tvctl.py pair` CLI. */
export function load() {
  return { paired: loadCredentials() !== null, host: loadTvHost() ?? '' };
}

export const actions = {
  async pair({ request }) {
    const form = await request.formData();
    const host = String(form.get('host') ?? '').trim();
    const pin = String(form.get('pin') ?? '').trim();
    if (!host || !pin) return fail(400, { error: 'Host and PIN are required.', host });

    const crypto = await import('node:crypto');
    const user = crypto.randomBytes(16).toString('hex');
    const creds = { user, password: '' };

    // 1) pair/request → obtain the shared auth_key
    const tv = getTv();
    void tv;
    try {
      const { requestPair, grantPair } = await import('$lib/server/pair');
      const session = await requestPair(host, user);
      await grantPair(host, user, session.authKey, pin);
      const final = { user, password: session.authKey };
      saveCredentials(host, final);
      setTv(host, final);
      return { success: true, host };
    } catch (e) {
      return fail(502, { error: String((e as Error).message ?? e), host });
    }
  },
};
