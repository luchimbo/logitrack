import { after } from 'next/server';
import { offerCommands } from '@/lib/crossselling/storefront-offer';
import { recordOfferEvent, verifiedOfferState } from '@/lib/crossselling/storefront-runtime';
export const dynamic = 'force-dynamic';
// Camino crítico de TN (800 ms): sólo verifica la firma y evalúa, sin base de datos.
export async function POST(request, context) {
  const started = Date.now();
  const { token } = await context.params;
  const state = verifiedOfferState(token, new URL(request.url).searchParams.get('s'));
  if (!state) return new Response(null, { status: 404 });
  try {
    if (Number(request.headers.get('content-length')) > 131072) return new Response(null, { status: 413 });
    const body = await request.text();
    if (body.length > 131072) return new Response(null, { status: 413 });
    const cart = JSON.parse(body);
    if (String(cart.store_id) !== '7570182') return new Response(null, { status: 204 });
    const commands = offerCommands(state, cart);
    const elapsedMs = Date.now() - started;
    after(() => recordOfferEvent(cart, commands, elapsedMs).catch((e) => console.warn('TN offer event failed', e.name)));
    return commands.length ? Response.json({ commands }) : new Response(null, { status: 204 });
  } catch (error) {
    console.warn('TN offer callback failed', error.name);
    return new Response(null, { status: 503 });
  }
}
