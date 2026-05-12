import crypto from 'crypto';
import { encrypt, decrypt } from '@/lib/cryptoUtils';

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || '';
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || '';
const SHOPIFY_SCOPES = process.env.SHOPIFY_SCOPES || 'read_orders,read_merchant_managed_fulfillment_orders';
const SHOPIFY_CALLBACK_URL = process.env.SHOPIFY_CALLBACK_URL || '';

export function isShopifyOAuthConfigured() {
  return Boolean(SHOPIFY_API_KEY && SHOPIFY_API_SECRET && SHOPIFY_CALLBACK_URL);
}

export function normalizeShopifyShop(value) {
  const input = String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!input) return '';
  const shop = input.endsWith('.myshopify.com') ? input : `${input}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    throw new Error('Dominio de Shopify inválido');
  }
  return shop;
}

export function encodeShopifyState({ workspaceId, appUserId }) {
  return encrypt(JSON.stringify({
    workspaceId,
    appUserId,
    expiresAt: Date.now() + 10 * 60 * 1000,
  }));
}

export function decodeShopifyState(state) {
  try {
    const data = JSON.parse(decrypt(state));
    if (!data.workspaceId || !data.appUserId || !data.expiresAt) throw new Error('State inválido');
    if (Date.now() > data.expiresAt) throw new Error('State expirado');
    return data;
  } catch {
    throw new Error('State inválido o expirado');
  }
}

function buildHmacMessage(searchParams) {
  const params = [];
  for (const [key, value] of searchParams.entries()) {
    if (key === 'hmac' || key === 'signature') continue;
    params.push(`${key}=${value}`);
  }
  return params.sort().join('&');
}

export function verifyShopifyOAuthHmac(searchParams) {
  const received = String(searchParams.get('hmac') || '');
  if (!SHOPIFY_API_SECRET || !received) return false;
  const expected = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(buildHmacMessage(searchParams))
    .digest('hex');
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export function buildShopifyAuthorizeUrl({ shop, state }) {
  if (!isShopifyOAuthConfigured()) {
    throw new Error('OAuth de Shopify no está configurado en el servidor');
  }
  const normalizedShop = normalizeShopifyShop(shop);
  const params = new URLSearchParams({
    client_id: SHOPIFY_API_KEY,
    scope: SHOPIFY_SCOPES,
    redirect_uri: SHOPIFY_CALLBACK_URL,
    state,
  });
  return `https://${normalizedShop}/admin/oauth/authorize?${params.toString()}`;
}

export async function exchangeShopifyCodeForToken({ shop, code }) {
  if (!isShopifyOAuthConfigured()) {
    throw new Error('OAuth de Shopify no está configurado en el servidor');
  }
  const normalizedShop = normalizeShopifyShop(shop);
  const res = await fetch(`https://${normalizedShop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Error al canjear autorización de Shopify');
  }

  return {
    accessToken: data.access_token,
    scope: data.scope,
  };
}

export function verifyShopifyWebhookHmac(rawBody, signature) {
  if (!SHOPIFY_API_SECRET) return true;
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', SHOPIFY_API_SECRET).update(rawBody).digest('base64');
  const received = String(signature || '').trim();
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'base64'), Buffer.from(received, 'base64'));
}
