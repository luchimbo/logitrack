import { NextResponse } from 'next/server';
import { decodeShopifyState, exchangeShopifyCodeForToken, normalizeShopifyShop, verifyShopifyOAuthHmac } from '@/lib/shopifyOAuth';
import { saveIntegrationConnection } from '@/lib/integrationService';
import { createShopifyClient } from '@/lib/shopifyClient';

const BASE_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://geomodi.ai';
const SHOPIFY_WEBHOOK_TOPICS = ['ORDERS_CREATE', 'ORDERS_UPDATED', 'ORDERS_CANCELLED', 'APP_UNINSTALLED'];

async function ensureShopifyWebhooks({ shop, accessToken }) {
  const client = createShopifyClient({ shop, accessToken });
  const callbackUrl = `${BASE_APP_URL.replace(/\/$/, '')}/api/webhooks/shopify`;
  const webhooks = await client.listWebhooks();
  const existing = new Set(webhooks.map((webhook) => `${webhook.topic}|${webhook.endpoint?.callbackUrl || ''}`));

  for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
    const key = `${topic}|${callbackUrl}`;
    if (existing.has(key)) continue;
    await client.createWebhook({ topic, callbackUrl });
  }
}

export async function GET(request) {
  const baseRedirect = `${BASE_APP_URL}/?tab=shopify`;
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const shop = normalizeShopifyShop(searchParams.get('shop'));
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) return NextResponse.redirect(`${baseRedirect}&shopify_error=${encodeURIComponent(error)}`);
    if (!code || !shop || !state) return NextResponse.redirect(`${baseRedirect}&shopify_error=${encodeURIComponent('Faltan parámetros de autorización')}`);
    if (!verifyShopifyOAuthHmac(searchParams)) return NextResponse.redirect(`${baseRedirect}&shopify_error=${encodeURIComponent('Firma OAuth inválida')}`);

    const stateData = decodeShopifyState(state);
    const tokens = await exchangeShopifyCodeForToken({ shop, code });
    const connectionId = await saveIntegrationConnection({
      workspaceId: stateData.workspaceId,
      provider: 'shopify',
      externalStoreId: shop,
      displayName: shop.replace('.myshopify.com', ''),
      config: { shop, accessToken: tokens.accessToken, scope: tokens.scope },
    });

    let webhookWarning = '';
    try {
      await ensureShopifyWebhooks({ shop, accessToken: tokens.accessToken });
    } catch (error) {
      console.error('Shopify webhook setup error:', error);
      webhookWarning = error.message || 'No se pudieron registrar webhooks de Shopify';
    }

    const warningParam = webhookWarning ? `&shopify_warning=${encodeURIComponent(webhookWarning)}` : '';
    return NextResponse.redirect(`${baseRedirect}&shopify_connected=1&shopify_connection_id=${encodeURIComponent(connectionId)}${warningParam}`);
  } catch (error) {
    console.error('Shopify OAuth callback error:', error);
    return NextResponse.redirect(`${baseRedirect}&shopify_error=${encodeURIComponent(error.message || 'Error en autorización Shopify')}`);
  }
}
