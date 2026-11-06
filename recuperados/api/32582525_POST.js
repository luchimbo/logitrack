import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { listIntegrationConnectionsByStore } from '@/lib/integrationService';
import { clientFromConnection } from '@/lib/mercadolibreResolver';
import { upsertMercadoLibreOrder } from '@/lib/mercadolibreStore';

const ORDER_TOPICS = new Set(['orders_v2', 'orders']);
const SHIPMENT_TOPICS = new Set(['shipments', 'flex-handshakes']);
const ALLOWED_TOPICS = new Set([...ORDER_TOPICS, ...SHIPMENT_TOPICS]);
const MELI_CLIENT_ID = process.env.MERCADOLIBRE_CLIENT_ID || '';
const MAX_WEBHOOK_BYTES = 64 * 1024;

function validateWebhookPayload(request, body = {}) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_WEBHOOK_BYTES) return 'payload demasiado grande';

  const topic = String(body.topic || '').trim();
  const resource = String(body.resource || '').trim();
  const userId = String(body.user_id || '').trim();
  const applicationId = String(body.application_id || '').trim();

  if (!ALLOWED_TOPICS.has(topic)) return 'topic no soportado';
  if (!resource.startsWith('/')) return 'resource invalido';
  if (!userId || !/^\d+$/.test(userId)) return 'user_id invalido';
  if (MELI_CLIENT_ID && applicationId && applicationId !== MELI_CLIENT_ID) return 'application_id invalido';
  return '';
}

function orderIdFromResource(resource = '') {
  const match = String(resource || '').match(/\/orders\/(\d+)/);
  return match?.[1] || '';
}

function shipmentIdFromResource(resource = '') {
  const match = String(resource || '').match(/\/shipments\/(\d+)/);
  return match?.[1] || '';
}

export async function POST(request) {
  try {
    await ensureDb();
    const body = await request.json().catch(() => ({}));
    const invalidReason = validateWebhookPayload(request, body);
    if (invalidReason) {
      return NextResponse.json({ error: invalidReason }, { status: invalidReason === 'application_id invalido' ? 403 : 400 });
    }

    await db.execute({
      sql: `INSERT INTO mercadolibre_notifications (topic, resource, user_id, application_id, payload_json)
            VALUES (?, ?, ?, ?, ?)`,
      args: [body.topic || '', body.resource || '', String(body.user_id || ''), String(body.application_id || ''), JSON.stringify(body)],
    });

    const userId = String(body.user_id || '').trim();
    const connections = await listIntegrationConnectionsByStore({ provider: 'mercadolibre', externalStoreId: userId, includeConfig: true });
    if (!connections.length) {
      return NextResponse.json({ received: true, ignored: 'cuenta no conectada' });
    }

    let updated = 0;
    for (const connection of connections) {
      const client = await clientFromConnection(connection);
      if (!client) continue;

      const result = await processMercadoLibreNotification({ client, connection, body });
      if (result.updated) updated += 1;
    }

    await db.execute({
      sql: `UPDATE mercadolibre_notifications SET processed_at = CURRENT_TIMESTAMP
            WHERE topic = ? AND resource = ? AND user_id = ? AND application_id = ? AND processed_at IS NULL`,
      args: [body.topic || '', body.resource || '', String(body.user_id || ''), String(body.application_id || '')],
    });

    return NextResponse.json({ received: true, updated: updated > 0, updatedConnections: updated });
  } catch (error) {
    console.error('Mercado Libre webhook error:', error);
    return NextResponse.json({ error: error.message || 'Error procesando webhook Mercado Libre' }, { status: 500 });
  }
}

async function processMercadoLibreNotification({ client, connection, body }) {
    let order = null;
    let shipment = null;
    let shipmentItems = [];
    let leadTime = null;
    let delays = null;
    let carrier = null;
    let history = [];

    if (ORDER_TOPICS.has(body.topic)) {
      const orderId = orderIdFromResource(body.resource);
      if (!orderId) return { updated: false };
      order = await client.getOrder(orderId);
    } else if (SHIPMENT_TOPICS.has(body.topic)) {
      const shipmentId = shipmentIdFromResource(body.resource);
      if (!shipmentId) return { updated: false };
      shipment = await client.getShipment(shipmentId);
      const externalReference = String(shipment?.external_reference || '');
      const possibleOrderId = externalReference && /^\d+$/.test(externalReference) ? externalReference : '';
      if (possibleOrderId) order = await client.getOrder(possibleOrderId).catch(() => null);
      if (!order) {
        const existingOrder = await db.execute({
          sql: `SELECT order_id FROM mercadolibre_orders
                WHERE workspace_id = ? AND integration_connection_id = ? AND shipment_id = ?
                ORDER BY synced_at DESC LIMIT 1`,
          args: [connection.workspaceId, connection.id, String(shipmentId)],
        });
        const storedOrderId = existingOrder.rows?.[0]?.order_id;
        if (storedOrderId) order = await client.getOrder(storedOrderId).catch(() => null);
      }
    }

    const shipmentId = order?.shipping?.id || shipment?.id;
    if (shipmentId) {
      shipment = shipment || await client.getShipment(shipmentId);
      shipmentItems = await client.getShipmentItems(shipmentId).catch(() => []);
      leadTime = await client.getShipmentLeadTime(shipmentId).catch(() => null);
      delays = await client.getShipmentDelays(shipmentId);
      carrier = await client.getShipmentCarrier(shipmentId);
      history = await client.getShipmentHistory(shipmentId);
    }

    if (order) {
      await upsertMercadoLibreOrder(connection.workspaceId, { order, shipment, shipmentItems, leadTime, delays, carrier, history }, {
        connectionId: connection.id,
        externalStoreId: connection.externalStoreId,
        siteId: connection.config.siteId || 'MLA',
      });
    }

    return { updated: Boolean(order) };
}
