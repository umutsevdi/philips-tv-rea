import { json } from '@sveltejs/kit';
import { getTv } from '$lib/server/tv';

/* Tune by channel number: digit keys + Confirm, gated by the transport. */
export async function POST({ request }) {
  let channel: number;
  try {
    const body = await request.json();
    channel = Number(body.channel);
    if (!Number.isInteger(channel) || channel <= 0) throw new Error('bad channel');
  } catch {
    return json({ error: 'body must be {"channel": N}' }, { status: 400 });
  }
  try {
    const tv = getTv();
    for (const digit of String(channel)) {
      await tv.post('/6/input/key', { key: `Digit${digit}` });
    }
    await tv.post('/6/input/key', { key: 'Confirm' });
    return json({ ok: true, channel });
  } catch (e) {
    return json({ error: String(e) }, { status: 502 });
  }
}
