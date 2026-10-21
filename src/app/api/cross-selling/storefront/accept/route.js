import { acceptOffer } from '@/lib/crossselling/storefront-runtime';
import { corsHeaders, fromStorefront, preflight, storefrontError } from '../cors';
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
// El cuerpo llega como text/plain para evitar el preflight; se valida el origen de la tienda.
export async function POST(request) {
  let input;
  try {
    if (Number(request.headers.get('content-length')) > 1024) throw Object.assign(new Error('Solicitud demasiado grande'), { status: 400 });
    const raw = await request.text();
    if (raw.length > 1024) throw Object.assign(new Error('Solicitud demasiado grande'), { status: 400 });
    input = JSON.parse(raw);
  } catch (error) {
    return storefrontError(error instanceof SyntaxError ? Object.assign(new Error('Solicitud inválida'), { status: 400 }) : error, corsHeaders(request, ''));
  }
  const storeId = String(input?.store || '');
  if (!fromStorefront(request, storeId)) return Response.json({ error: 'Origen inválido' }, { status: 403 });
  const headers = corsHeaders(request, storeId);
  try { return Response.json(await acceptOffer(storeId, input), { headers }); }
  catch (error) { return storefrontError(error, headers); }
}
