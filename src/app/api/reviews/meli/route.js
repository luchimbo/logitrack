import { authorizePublication } from '@/lib/crossselling/publication-auth';
import { lookupCrossSellingConnection } from '@/lib/crossselling/runtime';
import { storeMeliNickname } from '@/lib/crossselling/stores';
import { listAllActiveIntegrationConnections } from '@/lib/integrationService';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { collectMeliReviews } from '@/lib/reviews/meli-reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Mostrador pide las opiniones de Mercado Libre de la cuenta vinculada a la tienda (firma HMAC por tienda).
export async function GET(request) {
  const headers = { 'Cache-Control': 'no-store' };
  const storeId = authorizePublication({ request, rawBody: '' });
  if (!storeId) return Response.json({ error: 'Solicitud no autorizada' }, { status: 401, headers });
  try {
    const nickname = storeMeliNickname(storeId).toLowerCase();
    let targets = [];
    if (nickname) {
      // La cuenta de Mercado Libre de esta tienda es una sola, aunque esté conectada en otro espacio de Logitrack.
      const accounts = (await listAllActiveIntegrationConnections({ provider: 'mercadolibre', includeConfig: true }))
        .filter((c) => [c.displayName, c.config?.nickname].some((n) => String(n || '').toLowerCase() === nickname));
      for (const account of accounts) targets.push(...await listMercadoLibreClientTargets(account.workspaceId, { connectionId: account.id }));
      if (!targets.length) return Response.json({ error: `No hay conectada la cuenta de Mercado Libre «${nickname}»` }, { status: 409, headers });
    } else {
      const connection = await lookupCrossSellingConnection(storeId);
      if (!connection?.workspaceId) return Response.json({ error: 'Esta tienda no está vinculada a Logitrack' }, { status: 409, headers });
      targets = await listMercadoLibreClientTargets(connection.workspaceId);
      if (!targets.length) return Response.json({ error: 'No hay una cuenta de Mercado Libre conectada' }, { status: 409, headers });
    }
    const result = { accounts: targets.length, items: 0, withoutSkuCount: 0, withoutSku: [], errors: 0, withoutText: 0, withoutReviews: 0, reviews: [] };
    const seen = new Set();
    for (const target of targets) {
      const part = await collectMeliReviews({ client: target.client, sellerId: target.externalStoreId });
      for (const key of ['items', 'withoutSkuCount', 'errors', 'withoutText', 'withoutReviews']) result[key] += part[key];
      result.withoutSku.push(...part.withoutSku);
      for (const r of part.reviews) if (!seen.has(`${r.externalId}|${r.sku}`)) { seen.add(`${r.externalId}|${r.sku}`); result.reviews.push(r); }
    }
    return Response.json(result, { headers });
  } catch (error) {
    console.error('Opiniones de Mercado Libre:', error.message || error);
    return Response.json({ error: 'No se pudieron leer las opiniones de Mercado Libre' }, { status: 502, headers });
  }
}
