import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { createTiendanubeClient } from '@/lib/tiendanubeClient';
import { findIntegrationByConfigValue } from '@/lib/integrationService';
import { upsertTiendanubeOrder } from '@/lib/tiendanubeStore';

const TIENDANUBE_CLIENT_SECRET = process.env.TIENDANUBE_CLIENT_SECRET || '';
const ORDER_EVENTS = new Set([
  'order/created',
  'order/updated',
  'order/paid',
  'order/packed',
  'order/fulfilled',
  'order/cancelled',
  'order/edited',
  'order/pending',
  'order/voided',
  'order/unpacked',
]);
const FULFILLMENT_ORDER_EVENTS = new Set([
  'fulfillment_order/status_updated',
  'fulfillment_order/tracking_event_created',
  'fulfillment_order/tracking_event_updated',
  'fulfillment_order/tracking_event_deleted',
]);

function verifyTiendanubeSignature(rawBody, signature) {
  if (!TIENDANUBE_CLIENT_SECRET) return true;
  if (!signature) return false;

  const expected = crypto
    .createHmac('sha256', TIENDANUBE_CLIENT_SECRET)
    .update(rawBody)
    .digest('hex');
  const received = String(signature || '').trim();

  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function getWebhookOrderId(body) {
  if (body?.order_id) return body.order_id;
  if (ORDER_EVENTS.has(String(body?.event || ''))) return body?.id;
  return null;
}

export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-linkedstore-hmac-sha256') || '';

  if (!verifyTiendanubeSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
  }

  try {
    const body = rawBody ? JSON.parse(rawBody) : {};
    const storeId = String(body?.store_id || '').trim();
    const event = String(body?.event || '').trim();
    const orderId = getWebhookOrderId(body);

    if (!storeId || !event) {
      return NextResponse.json({ received: true, ignored: 'payload incompleto' });
    }

    if (!ORDER_EVENTS.has(event) && !FULFILLMENT_ORDER_EVENTS.has(event)) {
      return NextResponse.json({ received: true, ignored: 'evento no operativo' });
    }

    if (!orderId) {
      return NextResponse.json({ received: true, ignored: 'sin order id' });
    }

    const integration = await findIntegrationByConfigValue({
      provider: 'tiendanube',
      key: 'storeId',
      value: storeId,
    });

    if (!integration?.workspaceId || !integration?.config?.accessToken) {
      return NextResponse.json({ received: true, ignored: 'tienda no conectada' });
    }

    const client = createTiendanubeClient({
      accessToken: integration.config.accessToken,
      storeId: integration.config.storeId,
    });
    const order = await client.getOrder(orderId);
    await upsertTiendanubeOrder(integration.workspaceId, order);

    return NextResponse.json({ received: true, updated: true });
  } catch (error) {
    console.error('Tiendanube operational webhook error:', error);
    return NextResponse.json({ error: error.message || 'Error procesando webhook' }, { status: 500 });
  }
}
