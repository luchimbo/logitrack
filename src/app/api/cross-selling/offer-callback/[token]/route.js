import { after } from 'next/server';
import { offerCommands } from '@/lib/crossselling/storefront-offer';
import { callbackAcceptances, recordOfferEvent, verifiedOfferState } from '@/lib/crossselling/storefront-runtime';
export const dynamic = 'force-dynamic';
// Camino crítico de TN (800 ms): verifica la firma, lee las aceptaciones del carrito (Redis, máx. 300 ms) y evalúa.
export async function POST(request, context) {
  const started = Date.now();
  const { token } = await context.params;
  const params = new URL(request.url).searchParams;
  // La demo se registró sin parámetro de tienda.
  const state = verifiedOfferState(params.get('st') || '7570182', token, params.get('s'));
  if (!state) return new Response(null, { status: 404 });
  try {
    if (Number(request.headers.get('content-length')) > 131072) return new Response(null, { status: 413 });
    const body = await request.text();
    if (body.length > 131072) return new Response(null, { status: 413 });
    const cart = JSON.parse(body);
    if (String(cart.store_id) !== state.storeId) return new Response(null, { status: 204 });
    const acceptances = await callbackAcceptances(state, cart.cart_id);
    const commands = offerCommands({ ...state, acceptances }, cart);
    const elapsedMs = Date.now() - started;
    after(() => recordOfferEvent(cart, commands, elapsedMs).catch((e) => console.warn('TN offer event failed', e.name)));
    return commands.length ? Response.json({ commands }) : new Response(null, { status: 204 });
  } catch (error) {
    // Sin respuesta válida TN retira los descuentos: falla segura. Sólo tipo/código.
    console.warn('TN offer callback failed', error.name, error.code || '');
    return new Response(null, { status: 503 });
  }
}
