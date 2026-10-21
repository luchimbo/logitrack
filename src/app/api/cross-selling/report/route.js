import { authorizePublication } from '@/lib/crossselling/publication-auth';
import { onlineReport } from '@/lib/crossselling/storefront-runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Informe online de cross-selling para Mostrador, firmado igual que la publicación.
export async function GET(request) {
  const headers = { 'Cache-Control': 'no-store' };
  const storeId = authorizePublication({ request, rawBody: '' });
  if (!storeId) return Response.json({ error: 'Solicitud no autorizada' }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  try { return Response.json(await onlineReport(storeId, { from: params.get('from'), to: params.get('to') }), { headers }); }
  catch (error) {
    const status = [400, 404].includes(error.status) ? error.status : 502;
    return Response.json({ error: status === 502 ? 'No se pudo armar el informe online' : error.message }, { status, headers });
  }
}
