import { reviewsService } from '@/lib/reviews/runtime';
import { corsHeaders, fromStorefront, preflight } from '../../cross-selling/storefront/cors';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
// ?store=<id>&skus=A,B (los SKU de las variantes del producto). Respuesta pública, igual para todos.
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const storeId = String(params.get('store') || '');
  if (!fromStorefront(request, storeId)) return Response.json({ error: 'Origen inválido' }, { status: 403 });
  const headers = corsHeaders(request, storeId);
  const skus = String(params.get('skus') || '').split(',').map((s) => s.trim()).filter((s) => /^[\w.\-/ ]{1,60}$/.test(s)).slice(0, 30);
  if (!skus.length) return Response.json({ enabled: false, count: 0, avg: 0, reviews: [] }, { headers });
  try {
    const body = await reviewsService.forStorefront(storeId, skus);
    return Response.json(body, { headers: { ...headers, 'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=900' } });
  } catch {
    return Response.json({ error: 'No se pudieron cargar las reseñas' }, { status: 503, headers });
  }
}
