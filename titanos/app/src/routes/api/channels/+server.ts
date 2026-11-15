import { json } from '@sveltejs/kit';
import { getTv } from '$lib/server/tv';

/* Channel lists from /6/channeldb/tv, flattened for the Watch-live row. */
export async function GET() {
  try {
    const resp = await getTv().get('/6/channeldb/tv');
    const data = resp.json<Record<string, unknown>>();
    const out: { id: string; name: string; number: number; logo: string; preset?: number }[] = [];
    const lists = (data?.ChannelLists as Record<string, unknown>[]) ?? [];
    for (const lst of lists) {
      const channels = (lst.Channel as Record<string, unknown>[]) ?? [];
      channels.forEach((ch: Record<string, unknown>, i: number) => {
        out.push({
          id: (ch.ccid as string) ?? `${lst.List}-${i + 1}`,
          name: (ch.name as string) ?? '',
          number: (ch.preset as number) ?? (ch.logicalnr as number) ?? i + 1,
          logo: (ch.logo as string) ?? '',
          preset: ch.preset as number | undefined,
        });
      });
    }
    return json(out);
  } catch (e) {
    return json({ error: String(e) }, { status: 502 });
  }
}
