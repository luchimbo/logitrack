import { recordSeen } from '@/lib/crossselling/storefront-runtime';
import { fromStorefront } from '../cors';
export const dynamic = 'force-dynamic';
// Aviso de «ofertas vistas» desde la tienda (sendBeacon, text/plain). Sólo suma contadores por regla.
export async function POST(request) {
  try {
    const raw = await request.text();
    if (raw.length > 2048) return new Response(null, { status: 413 });
    const input = JSON.parse(raw);
    const storeId = String(input?.store || '');
    if (!fromStorefront(request, storeId)) return new Response(null, { status: 403 });
    const rules = (Array.isArray(input.rules) ? input.rules : []).slice(0, 6).map(String).filter((r) => r.length > 0 && r.length <= 120);
    if (rules.length) await recordSeen(storeId, rules);
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 });
  }
}
