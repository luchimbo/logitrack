import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { upsertMercadoLibreOrder, listStoredMercadoLibreOrders } from '@/lib/mercadolibreStore';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';

export async function POST(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) return NextResponse.json(authResult.error.body, { status: authResult.error.status });

    const body = await request.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();
    const connectionId = String(body?.connectionId || '').trim();
    if (!orderId || !connectionId) {
      return NextResponse.json({ error: 'orderId y connectionId son obligatorios' }, { status: 400 });
    }

    const workspaceId = authResult.actor.workspaceId;
    const targets = await listMercadoLibreClientTargets(workspaceId, { connectionId });
    if (!targets.length) throw new Error('Conexión Mercado Libre no disponible');

    const target = targets[0];
    const client = target.client;
    const siteId = target.config?.siteId || 'MLA';

    // Obtener la orden existente para conseguir el orderId externo de MercadoLibre
    const existing = await db.execute({
      sql: 'SELECT order_id, shipment_id FROM mercadolibre_orders WHERE workspace_id = ? AND integration_connection_id = ? AND order_id = ? LIMIT 1',
      args: [workspaceId, Number(connectionId), orderId],
    });
    if (!existing.rows.length) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    }

    const mlOrderId = existing.rows[0].order_id;
    const shipmentId = existing.rows[0].shipment_id;
    if (!shipmentId) {
      return NextResponse.json({ error: 'La orden no tiene shipment_id' }, { status: 422 });
    }

    // Re-fetch todos los datos del envío desde MercadoLibre
    const [order, shipment, shipmentItems, leadTime, delays, carrier, history] = await Promise.all([
      client.getOrder(mlOrderId).catch(() => null),
      client.getShipment(shipmentId).catch(() => null),
      client.getShipmentItems(shipmentId).catch(() => []),
      client.getShipmentLeadTime(shipmentId).catch(() => null),
      client.getShipmentDelays(shipmentId).catch(() => null),
      client.getShipmentCarrier(shipmentId).catch(() => null),
      client.getShipmentHistory(shipmentId).catch(() => []),
    ]);

    let finalCarrier = carrier;
    if (shipment?.logistic?.type === 'self_service') {
      const assignment = await client.getFlexAssignment({ siteId: shipment?.source?.site_id || siteId, shipmentId }).catch(() => null);
      const flexConfig = client.getFlexConfigurationForUser
        ? await client.getFlexConfigurationForUser({ siteId: shipment?.source?.site_id || siteId, userId: target.externalStoreId }).catch(() => null)
        : null;
      if (assignment || flexConfig) finalCarrier = { ...(finalCarrier || {}), flex_assignment: assignment, flex_config: flexConfig };
    }

    await upsertMercadoLibreOrder(
      workspaceId,
      { order, shipment, shipmentItems, leadTime, delays, carrier: finalCarrier, history },
      { connectionId: Number(connectionId), externalStoreId: target.externalStoreId, siteId }
    );

    // Devolver la orden actualizada
    const updated = await listStoredMercadoLibreOrders({ workspaceId, connectionId, q: orderId, limit: 1 });
    return NextResponse.json({ success: true, order: updated[0] || null });
  } catch (error) {
    console.error('Mercado Libre refresh error:', error);
    return NextResponse.json({ error: error.message || 'Error al actualizar orden' }, { status: 500 });
  }
}
