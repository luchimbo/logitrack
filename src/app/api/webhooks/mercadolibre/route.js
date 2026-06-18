import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { findIntegrationConnectionByStore } from '@/lib/integrationService';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { syncSingleMercadoLibreOrder } from '@/lib/mercadolibreStore';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const ORDER_TOPICS = new Set(['orders_v2', 'orders']);
const SHIPMENT_TOPICS = new Set(['shipments', 'flex-handshakes']);

function orderIdFromResource(resource = '') {
  const match = String(resource || '').match(/\/orders\/(\d+)/);
  return match?.[1] || '';
}

function shipmentIdFromResource(resource = '') {
  const match = String(resource || '').match(/\/shipments\/(\d+)/);
  return match?.[1] || '';
}

async function findStoredOrderIdByShipment({ workspaceId, connectionId, shipmentId }) {
  if (!shipmentId) return '';
  const result = await db.execute({
    sql: `SELECT order_id FROM mercadolibre_orders
          WHERE workspace_id = ? AND integration_connection_id = ? AND shipment_id = ?
          ORDER BY id DESC LIMIT 1`,
    args: [workspaceId, Number(connectionId), String(shipmentId)],
  });
  return result.rows?.[0]?.order_id ? String(result.rows[0].order_id) : '';
}

export async function POST(request) {
  try {
    await ensureDb();
    const body = await request.json().catch(() => ({}));
    const insertedNotification = await db.execute({
      sql: `INSERT INTO mercadolibre_notifications (topic, resource, user_id, application_id, payload_json)
            VALUES (?, ?, ?, ?, ?)`,
      args: [body.topic || '', body.resource || '', String(body.user_id || ''), String(body.application_id || ''), JSON.stringify(body)],
    });
    const notificationId = Number(insertedNotification.lastInsertRowid || 0);

    const userId = String(body.user_id || '').trim();
    const connection = userId ? await findIntegrationConnectionByStore({ provider: 'mercadolibre', externalStoreId: userId, includeConfig: true }) : null;
    if (!connection?.config?.accessToken) {
      return NextResponse.json({ received: true, ignored: 'cuenta no conectada' });
    }

    // Cliente con token refrescado automáticamente (evita fallar si el access token venció).
    const targets = await listMercadoLibreClientTargets(connection.workspaceId, { connectionId: connection.id });
    const client = targets[0]?.client;
    if (!client) {
      return NextResponse.json({ received: true, ignored: 'cliente no disponible' });
    }

    // Resolver el order_id a partir del topic (orden directa o vía el shipment).
    let orderId = '';
    if (ORDER_TOPICS.has(body.topic)) {
      orderId = orderIdFromResource(body.resource);
      if (!orderId) return NextResponse.json({ received: true, ignored: 'sin order id' });
    } else if (SHIPMENT_TOPICS.has(body.topic)) {
      const shipmentId = shipmentIdFromResource(body.resource);
      if (!shipmentId) return NextResponse.json({ received: true, ignored: 'sin shipment id' });
      const shipment = await client.getShipment(shipmentId).catch(() => null);
      const externalReference = String(shipment?.external_reference || '');
      if (externalReference && /^\d+$/.test(externalReference)) orderId = externalReference;
      if (!orderId) {
        orderId = await findStoredOrderIdByShipment({ workspaceId: connection.workspaceId, connectionId: connection.id, shipmentId });
      }
      if (!orderId) return NextResponse.json({ received: true, ignored: 'shipment sin order asociado' });
    } else {
      return NextResponse.json({ received: true, ignored: `topic ${body.topic || ''}` });
    }

    // Traer el detalle COMPLETO del envío (shipment, items, lead_time, delays, carrier, historial
    // y asignación Flex) y guardarlo. Así Geomodi tiene toda la data de envíos en tiempo real.
    const full = await syncSingleMercadoLibreOrder({
      workspaceId: connection.workspaceId,
      client,
      orderId,
      connectionId: connection.id,
      externalStoreId: connection.externalStoreId,
      siteId: connection.config.siteId || 'MLA',
      light: false,
    });

    if (notificationId) {
      await db.execute({
        sql: `UPDATE mercadolibre_notifications SET processed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [notificationId],
      });
    }

    return NextResponse.json({ received: true, updated: Boolean(full?.order) });
  } catch (error) {
    // Responder 200 igual: la notificación quedó registrada y no queremos que ML reintente
    // en loop por un fallo puntual al traer la orden.
    console.error('Mercado Libre webhook error:', error);
    return NextResponse.json({ received: true, error: error.message || 'error procesando' });
  }
}
