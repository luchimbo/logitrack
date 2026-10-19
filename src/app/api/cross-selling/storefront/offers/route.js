import { offersForStorefront } from '@/lib/crossselling/storefront-runtime';
import { corsHeaders, fromStorefront, storefrontError } from '../cors';
export const dynamic = 'force-dynamic';
export const OPTIONS = () => new Response(null, { status: 204, headers: corsHeaders });
// ?store=7570182&items=variante:línea:cantidad,... (lo que muestra LS.cart).
export async function GET(request) {
  if (!fromStorefront(request)) return Response.json({ error: 'Origen inválido' }, { status: 403 });
  const params = new URL(request.url).searchParams;
  if (params.get('store') !== '7570182') return Response.json({ offers: [] }, { headers: corsHeaders });
  const items = String(params.get('items') || '').split(',').slice(0, 40).map((s) => s.split(':'))
    .filter(([v, l, q]) => /^\d{1,15}$/.test(v) && /^\d{1,15}$/.test(l) && /^\d{1,4}$/.test(q))
    .map(([variantId, lineId, quantity]) => ({ variantId, lineId, quantity: Number(quantity) }));
  if (!items.length) return Response.json({ offers: [] }, { headers: corsHeaders });
  try { return Response.json({ offers: await offersForStorefront(items) }, { headers: corsHeaders }); }
  catch (error) { return storefrontError(error); }
}
