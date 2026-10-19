import { storeOrigins } from '@/lib/crossselling/stores';

// Cada tienda acepta sólo sus propios dominios; el origen se refleja si está permitido.
export function corsHeaders(request, storeId) {
  const origin = request.headers.get('origin');
  return { ...(storeOrigins(storeId).includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600', Vary: 'Origin', 'Cache-Control': 'no-store' };
}
export const fromStorefront = (request, storeId) => storeOrigins(storeId).includes(request.headers.get('origin'));
export function preflight(request) {
  const origin = request.headers.get('origin');
  const headers = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' };
  return new Response(null, { status: 204, headers: origin ? { ...headers, 'Access-Control-Allow-Origin': origin } : headers });
}
export function storefrontError(error, headers) {
  const status = [400, 404, 409].includes(error.status) ? error.status : 503;
  return Response.json({ error: status === 503 ? 'No se pudo procesar la oferta' : error.message }, { status, headers });
}
