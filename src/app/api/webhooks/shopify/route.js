import { NextResponse } from 'next/server';
import { findIntegrationConnectionByStore } from '@/lib/integrationService';
import { createShopifyClient } from '@/lib/shopifyClient';
import { upsertShopifyOrder } from '@/lib/shopifyStore';
import { verifyShopifyWebhookHmac } from '@/lib/shopifyOAuth';

const ORDER_TOPICS = new Set(['orders/create', 'orders/updated', 'orders/cancelled']);

export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-shopify-hmac-sha256') || '';
  const shop = String(request.headers.get('x-shopify-shop-domain') || '').trim().toLowerCase();
  const topic = String(request.headers.get('x-shopify-topic') || '').trim().toLowerCase();

  if (!verifyShopifyWebhookHmac(rawBody, signature)) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
  }

  try {
    if (!shop || !topic || !ORDER_TOPICS.has(topic)) {
      return NextResponse.json({ received: true, ignored: 'evento no operativo' });
    }

    const body = rawBody ? JSON.parse(rawBody) : {};
    const connection = await findIntegrationConnectionByStore({ provider: 'shopify', externalStoreId: shop, includeConfig: true });
    if (!connection?.workspaceId || !connection?.config?.accessToken) {
      return NextResponse.json({ received: true, ignored: 'tienda no conectada' });
    }

    const orderId = body?.admin_graphql_api_id || (body?.id ? `gid://shopify/Order/${body.id}` : '');
    if (!orderId) return NextResponse.json({ received: true, ignored: 'sin order id' });

    const client = createShopifyClient({ shop, accessToken: connection.config.accessToken });
    const order = await client.getOrder(orderId);
    if (order) {
      await upsertShopifyOrder(connection.workspaceId, order, { connectionId: connection.id, externalStoreId: shop });
    }

    return NextResponse.json({ received: true, updated: Boolean(order) });
  } catch (error) {
    console.error('Shopify webhook error:', error);
    return NextResponse.json({ error: error.message || 'Error procesando webhook Shopify' }, { status: 500 });
  }
}
