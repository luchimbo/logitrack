import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { ensureDb } from '@/lib/ensureDb';
import { db } from '@/lib/db';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { syncSingleMercadoLibreOrder, syncMercadoLibreOrdersPage } from '@/lib/mercadolibreStore';
import { syncZipnovaShipmentsPage } from '@/lib/zipnovaStore';
import { getIntegration } from '@/lib/integrationService';

export const maxDuration = 300;
export async function POST(request) {
  try {
    await ensureDb();
    const auth = await requireWorkspaceActor(request);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const body = await request.json();
    if (body.mode === 'labels') {
      const trackings = Array.isArray(body.trackings) ? body.trackings.map(String).filter((t) => /^\d{8,}$/.test(t)).slice(0, 10) : [];
      const accounts = (await listMercadoLibreClientTargets(auth.actor.workspaceId)).filter((t) => t.client);
      const results = [];
      for (const tracking of trackings) {
        let found = null;
        for (const account of accounts) {
          try {
            const items = await account.client.getShipmentItems(tracking);
            const orderId = (Array.isArray(items) ? items : items?.results || [])[0]?.order_id;
            if (orderId) { found = { account, orderId }; break; }
          } catch { /* Shipment of another account, or not found: try the next one. */ }
        }
        if (!found) { results.push({ tracking, ok: false }); continue; }
        try {
          await syncSingleMercadoLibreOrder({ workspaceId: auth.actor.workspaceId, client: found.account.client, orderId: found.orderId, connectionId: found.account.connectionId,
            externalStoreId: found.account.externalStoreId, siteId: found.account.config?.siteId || 'MLA' });
          results.push({ tracking, ok: true, orderId: String(found.orderId) });
        } catch (error) { results.push({ tracking, ok: false, error: error.message }); }
      }
      return NextResponse.json({ results });
    }
    if (body.mode === 'zipnova') {
      const integration = await getIntegration({ workspaceId: auth.actor.workspaceId, provider: 'zipnova' }).catch(() => null);
      if (!integration && !process.env.ZIPNOVA_API_TOKEN) return NextResponse.json({ skipped: true, done: true, synced: 0 });
      const valid = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
      return NextResponse.json(await syncZipnovaShipmentsPage({ workspaceId: auth.actor.workspaceId, from: valid(body.from), to: valid(body.to), page: Math.max(1, Number(body.page) || 1) }));
    }
    if (body.mode === 'plan' || body.mode === 'orders') {
      const accounts = await listMercadoLibreClientTargets(auth.actor.workspaceId);
      if (body.mode === 'plan') return NextResponse.json({ connections: accounts.filter((t) => t.client).map((t) => ({ connectionId: t.connectionId, name: t.config?.name || t.externalStoreId || String(t.connectionId) })) });
      const account = accounts.find((t) => Number(t.connectionId) === Number(body.connectionId));
      if (!account?.client) return NextResponse.json({ error: 'Cuenta de Mercado Libre no disponible' }, { status: 400 });
      const page = await syncMercadoLibreOrdersPage({ workspaceId: auth.actor.workspaceId, client: account.client, connectionId: account.connectionId,
        externalStoreId: account.externalStoreId, siteId: account.config?.siteId || 'MLA', offset: Number(body.offset) || 0,
        dateFrom: typeof body.dateFrom === 'string' ? body.dateFrom : '', dateTo: typeof body.dateTo === 'string' ? body.dateTo : '' });
      return NextResponse.json(page);
    }
    const { orders } = body;
    if (!Array.isArray(orders) || !orders.length || orders.length > 10) return NextResponse.json({ error: 'Enviar entre 1 y 10 envíos por lote' }, { status: 400 });
    const workspaceId = auth.actor.workspaceId;
    const targets = await listMercadoLibreClientTargets(workspaceId);
    const results = [];
    for (const order of orders) {
      try {
        const target = targets.find((t) => Number(t.connectionId) === Number(order.connectionId));
        const found = await db.execute({ sql: 'SELECT id FROM mercadolibre_orders WHERE workspace_id=? AND integration_connection_id=? AND order_id=?', args: [workspaceId, Number(order.connectionId), String(order.orderId)] });
        if (!target?.client || !found.rows.length) throw new Error('Envío no disponible en este espacio');
        const full = await syncSingleMercadoLibreOrder({ workspaceId, client: target.client, orderId: order.orderId, connectionId: target.connectionId, externalStoreId: target.externalStoreId, siteId: target.config?.siteId || 'MLA' });
        results.push({ orderId: order.orderId, ok: !full.syncErrors?.length, errors: full.syncErrors || [] });
      } catch (error) { results.push({ orderId: order.orderId, ok: false, errors: [error.message] }); }
    }
    return NextResponse.json({ results });
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 500 }); }
}
