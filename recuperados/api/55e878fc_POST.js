import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { deleteIntegration, deleteIntegrationConnections } from '@/lib/integrationService';

const TIENDANUBE_CLIENT_SECRET = process.env.TIENDANUBE_CLIENT_SECRET || '';
const VALID_TOPICS = new Set([
  'store-redact',
  'customers-redact',
  'customers-data-request',
  'store',
  'customers',
]);

function verifyTiendanubeSignature(rawBody, signature) {
  if (!TIENDANUBE_CLIENT_SECRET) return false;
  if (!signature) return false;

  const expected = crypto
    .createHmac('sha256', TIENDANUBE_CLIENT_SECRET)
    .update(rawBody)
    .digest('hex');
  const received = String(signature || '').trim();

  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function normalizePrivacyTopic(topic, body) {
  const event = String(body?.event || '').replace('/', '-');
  if (event === 'store-redact' || event === 'customers-redact' || event === 'customers-data_request') {
    return event.replace('data_request', 'data-request');
  }
  return topic;
}

function getStoreId(body) {
  return String(body?.store_id || body?.store || body?.id || '').trim();
}

function getCustomerIdentifiers(body) {
  const customer = body?.customer || body?.customer_data || {};
  return {
    id: String(body?.customer_id || customer?.id || '').trim(),
    email: String(body?.customer_email || customer?.email || body?.email || '').trim().toLowerCase(),
  };
}

async function redactStore(storeId) {
  await ensureDb();
  const connections = await db.execute({
    sql: `SELECT workspace_id FROM workspace_integration_connections
          WHERE provider = 'tiendanube' AND external_store_id = ?`,
    args: [storeId],
  });

  const workspaceIds = [...new Set((connections.rows || []).map((row) => Number(row.workspace_id)).filter(Boolean))];

  await db.execute({
    sql: `DELETE FROM tiendanube_orders WHERE external_store_id = ?`,
    args: [storeId],
  });
  await db.execute({
    sql: `DELETE FROM tiendanube_oauth_sessions WHERE store_id = ?`,
    args: [storeId],
  });

  for (const workspaceId of workspaceIds) {
    await deleteIntegrationConnections({ workspaceId, provider: 'tiendanube' });
    await deleteIntegration({ workspaceId, provider: 'tiendanube' });
  }

  return { workspaceIds, deletedStoreId: storeId };
}

async function redactCustomer(storeId, { email }) {
  await ensureDb();
  const conditions = [];
  const args = [];

  if (storeId) {
    conditions.push('external_store_id = ?');
    args.push(storeId);
  }
  if (email) {
    conditions.push('LOWER(COALESCE(contact_email, "")) = ?');
    args.push(email);
  }

  if (!conditions.length) return { updated: 0 };

  const result = await db.execute({
    sql: `UPDATE tiendanube_orders SET
            contact_name = '',
            contact_email = '',
            contact_phone = '',
            shipping_address_json = '{}',
            updated_at_external = COALESCE(updated_at_external, ''),
            synced_at = CURRENT_TIMESTAMP
          WHERE ${conditions.join(' AND ')}`,
    args,
  });

  return { updated: Number(result.rowsAffected || 0) };
}

async function exportCustomerData(storeId, { email }) {
  await ensureDb();
  const conditions = [];
  const args = [];

  if (storeId) {
    conditions.push('external_store_id = ?');
    args.push(storeId);
  }
  if (email) {
    conditions.push('LOWER(COALESCE(contact_email, "")) = ?');
    args.push(email);
  }

  if (!conditions.length) return { orders: [] };

  const result = await db.execute({
    sql: `SELECT tiendanube_id, number, status, payment_status, shipping_status,
                 contact_name, contact_email, contact_phone, shipping_address_json,
                 products_json, total, currency, created_at_external, updated_at_external
          FROM tiendanube_orders
          WHERE ${conditions.join(' AND ')}
          ORDER BY created_at_external DESC
          LIMIT 200`,
    args,
  });

  return { orders: result.rows || [] };
}

export async function POST(request, { params }) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-linkedstore-hmac-sha256') || '';

  if (!verifyTiendanubeSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
  }

  try {
    const { topic } = await params;
    const body = rawBody ? JSON.parse(rawBody) : {};
    const normalizedTopic = normalizePrivacyTopic(topic, body);

    if (!VALID_TOPICS.has(topic) || !VALID_TOPICS.has(normalizedTopic)) {
      return NextResponse.json({ error: 'Topic no soportado' }, { status: 404 });
    }

    const storeId = getStoreId(body);
    const customer = getCustomerIdentifiers(body);

    if (normalizedTopic === 'store-redact' || normalizedTopic === 'store') {
      if (!storeId) return NextResponse.json({ received: true, ignored: 'sin store_id' });
      const result = await redactStore(storeId);
      return NextResponse.json({ received: true, redacted: 'store', ...result });
    }

    if (normalizedTopic === 'customers-redact' || normalizedTopic === 'customers') {
      const result = await redactCustomer(storeId, customer);
      return NextResponse.json({ received: true, redacted: 'customer', ...result });
    }

    if (normalizedTopic === 'customers-data-request') {
      const data = await exportCustomerData(storeId, customer);
      return NextResponse.json({ received: true, data });
    }

    return NextResponse.json({ received: true, ignored: 'topic sin acción' });
  } catch (error) {
    console.error('Tiendanube privacy webhook error:', error);
    return NextResponse.json({ error: error.message || 'Error procesando webhook' }, { status: 500 });
  }
}
