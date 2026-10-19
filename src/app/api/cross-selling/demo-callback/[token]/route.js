import { after } from 'next/server';
import { evaluateProbe, recordProbeEvent, verifiedProbeState } from '@/lib/crossselling/demo-probe';
export const dynamic = 'force-dynamic';
export async function POST(request, context) {
  const started = Date.now();
  const { token } = await context.params;
  const state = verifiedProbeState(token, new URL(request.url).searchParams.get('state'));
  if (!state) return new Response(null, { status: 404 });
  try {
    if (Number(request.headers.get('content-length')) > 131072) return new Response(null, { status: 413 });
    const body = await request.text();
    if (body.length > 131072) return new Response(null, { status: 413 });
    const cart = JSON.parse(body);
    if (String(cart.store_id) !== '7570182') return new Response(null, { status: 310 });
    const commands = evaluateProbe(state, cart);
    const elapsedMs = Date.now() - started;
    after(() => recordProbeEvent(cart, commands, elapsedMs));
    return commands.length ? Response.json({ commands }) : new Response(null, { status: 204 });
  } catch (error) {
    // Sólo tipo/código, sin URL autenticada ni datos del carrito.
    console.warn('TN demo callback failed', error.name, /^DB_HTTP_\d+$/.test(error.code || '') ? error.code : error.cause?.code || 'EVALUATION_FAILED');
    return new Response(null, { status: 503 });
  }
}
