import { STOREFRONT_ORIGIN } from '@/lib/crossselling/storefront-runtime';

export const corsHeaders = { 'Access-Control-Allow-Origin': STOREFRONT_ORIGIN, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin', 'Cache-Control': 'no-store' };
export const fromStorefront = (request) => request.headers.get('origin') === STOREFRONT_ORIGIN;
export function storefrontError(error) {
  const status = [400, 404, 409].includes(error.status) ? error.status : 503;
  return Response.json({ error: status === 503 ? 'No se pudo procesar la oferta' : error.message }, { status, headers: corsHeaders });
}
