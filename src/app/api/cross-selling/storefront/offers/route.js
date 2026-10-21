import { offersForStorefront } from '@/lib/crossselling/storefront-runtime';
import { corsHeaders, fromStorefront, preflight, storefrontError } from '../cors';
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
// ?store=<id>&items=variante:línea:cantidad,... (lo que muestra LS.cart).
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const storeId = String(params.get('store') || '');
  if (!fromStorefront(request, storeId)) return Response.json({ error: 'Origen inválido' }, { status: 403 });
  const headers = corsHeaders(request, storeId);
  const items = String(params.get('items') || '').split(',').slice(0, 40).map((s) => s.split(':'))
    .filter(([v, l, q]) => /^\d{1,15}$/.test(v) && /^\d{1,15}$/.test(l) && /^\d{1,4}$/.test(q))
    .map(([variantId, lineId, quantity]) => ({ variantId, lineId, quantity: Number(quantity) }));
  if (!items.length) return Response.json({ offers: [] }, { headers });
  // Página de producto (línea 0): la respuesta es igual para todos los clientes y sólo tiene
  // precios públicos. Se cachea en el CDN un minuto (y se sirve vencida mientras se renueva).
  const productView = items.every((i) => i.lineId === '0');
  const cacheHeaders = productView ? { ...headers, 'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=600' } : headers;
  try { return Response.json({ offers: await offersForStorefront(storeId, items) }, { headers: cacheHeaders }); }
  catch (error) { return storefrontError(error, headers); }
}
