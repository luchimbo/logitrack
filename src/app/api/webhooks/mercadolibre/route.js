import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { findIntegrationConnectionByStore } from '@/lib/integrationService';
import { createMercadoLibreClient } from '@/lib/mercadolibreClient';
import { upsertMercadoLibreOrder } from '@/lib/mercadolibreStore';

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

export async function POST(request) {
  try {
    await ensureDb();
    const body = await request.json().catch(() => ({}));
    await db.execute({
      sql: `INSERT INTO mercadolibre_notifications (topic, resource, user_id, application_id, payload_json)
            VALUES (?, ?, ?, ?, ?)`,
      args: [body.topic || '', body.resource || '', String(body.user_id || ''), String(body.application_id || ''), JSON.stringify(body)],
    });

    const userId = String(body.user_id || '').trim();
    const connection = userId ? await findIntegrationConnectionByStore({ provider: 'mercadolibre', externalStoreId: userId, includeConfig: true }) : null;
    if (!connection?.config?.accessToken) {
      return NextResponse.json({ received: true, ignored: 'cuenta no conectada' });
    }

    const client = createMercadoLibreClient({ accessToken: connection.config.accessToken });
    let order = null;
    let shipment = null;
    let shipmentItems = [];
    let leadTime = null;
    let delays = null;
    let carrier = null;
    let history = [];

    if (ORDER_TOPICS.has(body.topic)) {
      const orderId = orderIdFromResource(body.resource);
      if (!orderId) return NextResponse.json({ received: true, ignored: 'sin order id' });
      order = await client.getOrder(orderId);
    } else if (SHIPMENT_TOPICS.has(body.topic)) {
      const shipmentId = shipmentIdFromResource(body.resource);
      if (!shipmentId) return NextResponse.json({ received: true, ignored: 'sin shipment id' });
      shipment = await client.getShipment(shipmentId);
      const externalReference = String(shipment?.external_reference || '');
      const possibleOrderId = externalReference && /^\d+$/.test(externalReference) ? externalReference : '';
      if (possibleOrderId) order = await client.getOrder(possibleOrderId).catch(() => null);
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

    return NextResponse.json({ received: true, updated: Boolean(order) });
  } catch (error) {
    console.error('Mercado Libre webhook error:', error);
    return NextResponse.json({ error: error.message || 'Error procesando webhook Mercado Libre' }, { status: 500 });
  }
}
