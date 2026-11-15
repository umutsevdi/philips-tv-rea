import { ncFile } from '$lib/server/nextcloud';

/* Stream a Nextcloud file. w/h → server-resized preview (images); raw +
   Range passthrough otherwise (video seeking). */
export async function GET({ url, request }) {
  const path = url.searchParams.get('path');
  const w = url.searchParams.get('w');
  const h = url.searchParams.get('h');
  const crop = url.searchParams.get('crop') === '1';
  if (!path) return new Response(JSON.stringify({ error: 'path required' }),
    { status: 400, headers: { 'Content-Type': 'application/json' } });
  try {
    const upstream = await ncFile(path,
      w ? parseInt(w, 10) : undefined,
      h ? parseInt(h, 10) : undefined,
      request.headers.get('range') ?? undefined,
      crop);
    const headers = new Headers();
    const ct = upstream.headers['content-type'];
    const cl = upstream.headers['content-length'];
    const cr = upstream.headers['content-range'];
    if (ct) headers.set('Content-Type', Array.isArray(ct) ? ct[0] : ct);
    if (cl) headers.set('Content-Length', String(cl));
    if (cr) headers.set('Content-Range', Array.isArray(cr) ? cr[0] : cr);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'max-age=3600');
    return new Response(upstream.body as unknown as ReadableStream, { status: upstream.statusCode, headers });
  } catch (e) {
    const status = (e as { ncStatus?: number }).ncStatus ?? 502;
    return new Response(JSON.stringify({ error: String((e as Error).message) }),
      { status, headers: { 'Content-Type': 'application/json' } });
  }
}
