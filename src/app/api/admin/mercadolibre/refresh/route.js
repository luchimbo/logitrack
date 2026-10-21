import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { syncSingleMercadoLibreOrder, listStoredMercadoLibreOrders } from '@/lib/mercadolibreStore';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';

export async function POST(request) {
  try {
    await ensureDb();
    const auth = await requireWorkspaceActor(request);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const { orderId, connectionId } = await request.json();
    if (!orderId || !connectionId) return NextResponse.json({ error: 'orderId y connectionId son obligatorios' }, { status: 400 });
    const workspaceId = auth.actor.workspaceId;
    const exists = await db.execute({ sql: 'SELECT id FROM mercadolibre_orders WHERE workspace_id=? AND integration_connection_id=? AND order_id=?', args: [workspaceId, Number(connectionId), String(orderId)] });
    if (!exists.rows.length) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    const [target] = await listMercadoLibreClientTargets(workspaceId, { connectionId });
    if (!target?.client) throw new Error('Conexión no disponible');
    const full = await syncSingleMercadoLibreOrder({ workspaceId, client: target.client, orderId, connectionId: target.connectionId, externalStoreId: target.externalStoreId, siteId: target.config?.siteId || 'MLA' });
    const orders = await listStoredMercadoLibreOrders({ workspaceId, connectionId, q: String(orderId), limit: 1 });
    return NextResponse.json({ success: !full.syncErrors?.length, warnings: full.syncErrors || [], order: orders[0] || null });
  } catch (error) { return NextResponse.json({ error: error.message || 'No se pudo actualizar' }, { status: 500 }); }
}
