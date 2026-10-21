import { crossSellingService } from '@/lib/crossselling/runtime';
import { authorizePublication } from '@/lib/crossselling/publication-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const maxBytes = 8 * 1024 * 1024;
    if (Number(request.headers.get('content-length')) > maxBytes) return Response.json({ error: 'Publicación demasiado grande' }, { status: 413, headers });
    const raw = request.method === 'GET' ? '' : await request.text();
    if (Buffer.byteLength(raw) > maxBytes) return Response.json({ error: 'Publicación demasiado grande' }, { status: 413, headers });
    const storeId = authorizePublication({ request, rawBody: raw });
    if (!storeId) return Response.json({ error: 'Publicación no autorizada' }, { status: 401, headers });
    const result = request.method === 'GET' ? await crossSellingService.status(storeId) : await crossSellingService.publish(storeId, JSON.parse(raw));
    return Response.json(result, { headers });
  } catch (error) {
    const status = error.status === 409 ? 409 : error instanceof SyntaxError || error.message === 'Configuración online inválida' ? 400 : 502;
    // No reflejar respuestas de proveedores que pudieran contener datos internos.
    return Response.json({ error: status === 409 || status === 400 ? error.message : 'No se pudo publicar la configuración online' }, { status, headers });
  }
}
export const GET = handle;
export const PUT = handle;
