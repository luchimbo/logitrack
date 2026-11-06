import { authorizePublication } from '@/lib/crossselling/publication-auth';
import { reviewsService } from '@/lib/reviews/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Mostrador publica las reseñas aprobadas (PUT) o consulta lo publicado (GET); firma HMAC por tienda.
async function handle(request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const maxBytes = 4 * 1024 * 1024;
    if (Number(request.headers.get('content-length')) > maxBytes) return Response.json({ error: 'Publicación demasiado grande' }, { status: 413, headers });
    const raw = request.method === 'GET' ? '' : await request.text();
    if (Buffer.byteLength(raw) > maxBytes) return Response.json({ error: 'Publicación demasiado grande' }, { status: 413, headers });
    const storeId = authorizePublication({ request, rawBody: raw });
    if (!storeId) return Response.json({ error: 'Publicación no autorizada' }, { status: 401, headers });
    const result = request.method === 'GET' ? await reviewsService.status(storeId) : await reviewsService.publish(storeId, JSON.parse(raw));
    return Response.json(result, { headers });
  } catch (error) {
    const status = [400, 409].includes(error.status) ? error.status : error instanceof SyntaxError || error.message === 'Reseñas online inválidas' ? 400 : 502;
    return Response.json({ error: status === 502 ? 'No se pudieron publicar las reseñas' : error.message }, { status, headers });
  }
}
export const GET = handle;
export const PUT = handle;
