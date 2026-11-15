import { json } from '@sveltejs/kit';
import { ncList } from '$lib/server/nextcloud';

export async function GET({ url }) {
  const path = url.searchParams.get('path') || '/';
  try {
    return json(await ncList(path));
  } catch (e) {
    const status = (e as { ncStatus?: number }).ncStatus ?? 502;
    return json({ error: String((e as Error).message), auth: status === 401 }, { status });
  }
}
