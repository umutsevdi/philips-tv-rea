import { json } from '@sveltejs/kit';
import { getTv } from '$lib/server/tv';

/* Active input/app from /6/context. */
export async function GET() {
  try {
    const resp = await getTv().get('/6/context');
    return json(resp.json() ?? {}, { status: resp.status });
  } catch (e) {
    return json({ error: String(e) }, { status: 502 });
  }
}
