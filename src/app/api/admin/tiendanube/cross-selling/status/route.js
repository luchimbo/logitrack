import { requireWorkspaceAdmin } from '@/lib/auth';
import { getIntegration, listIntegrationConnections } from '@/lib/integrationService';
import { createTiendanubeClient } from '@/lib/tiendanubeClient';

// Diagnóstico de sólo lectura: nunca crea promociones ni revela tokens.
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const auth = await requireWorkspaceAdmin(request);
    if (auth.error) return Response.json(auth.error.body, { status: auth.error.status, headers });
    const storeId = new URL(request.url).searchParams.get('storeId');
    if (!/^\d{1,20}$/.test(storeId || '')) return Response.json({ error: 'Indicá el ID de tienda' }, { status: 400, headers });
    const workspaceId = auth.actor.workspaceId;
    const connections = await listIntegrationConnections({ workspaceId, provider: 'tiendanube', includeConfig: true });
    let connection = connections.find((c) => c.externalStoreId === storeId && String(c.config?.storeId) === storeId);
    if (!connection) {
      const legacy = await getIntegration({ workspaceId, provider: 'tiendanube' });
      if (String(legacy?.config?.storeId) === storeId) connection = legacy;
    }
    if (!connection?.config?.accessToken) return Response.json({ storeId, connected: false, error: 'Esta tienda no está vinculada al espacio actual' }, { status: 409, headers });
    const client = createTiendanubeClient({ storeId, accessToken: connection.config.accessToken });
    const results = await Promise.allSettled([client.getStore(), client.listProducts({ perPage: 1 }), client.listPromotions()]);
    const names = ['store', 'catalog', 'promotions'];
    const checks = Object.fromEntries(results.map((r, i) => [names[i], r.status === 'fulfilled' ? { ok: true } : { ok: false, httpStatus: r.reason?.status || null }]));
    const store = results[0].status === 'fulfilled' ? results[0].value : null;
    return Response.json({ storeId, connected: true, domain: store?.original_domain || null,
      scopes: String(connection.config.scope || '').split(/[\s,]+/).filter(Boolean), checks,
      readyForCheckoutTest: results.every((r) => r.status === 'fulfilled') }, { headers });
  } catch {
    return Response.json({ error: 'No se pudo comprobar el acceso a Tiendanube' }, { status: 502, headers });
  }
}
