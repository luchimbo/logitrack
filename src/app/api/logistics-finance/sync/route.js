import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { ensureDb } from '@/lib/ensureDb';
import { db } from '@/lib/db';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { syncSingleMercadoLibreOrder } from '@/lib/mercadolibreStore';

export const maxDuration = 300;
export async function POST(request) {
  try {
    await ensureDb();
    const auth = await requireWorkspaceActor(request);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const { orders } = await request.json();
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
