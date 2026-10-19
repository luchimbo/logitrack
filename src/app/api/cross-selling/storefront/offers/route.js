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
  try { return Response.json({ offers: await offersForStorefront(storeId, items) }, { headers }); }
  catch (error) { return storefrontError(error, headers); }
}
