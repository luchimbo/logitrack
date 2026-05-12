import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';

function moneyAmount(value) {
  return String(value?.shopMoney?.amount || value?.amount || '');
}

function mapStoredShopifyRow(row) {
  return {
    id: row.shopify_gid,
    legacyId: row.shopify_legacy_id,
    connectionId: row.integration_connection_id ? Number(row.integration_connection_id) : null,
    externalStoreId: row.external_store_id || '',
    number: row.name,
    financialStatus: row.financial_status,
    fulfillmentStatus: row.fulfillment_status,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    shippingAddress: JSON.parse(row.shipping_address_json || '{}'),
    products: JSON.parse(row.products_json || '[]'),
    shippingMethod: row.shipping_method || '',
    shippingCarrier: row.shipping_carrier || '',
    subtotal: row.subtotal,
    total: row.total,
    currency: row.currency,
    createdAt: row.created_at_external,
    updatedAt: row.updated_at_external,
    dispatchedAt: row.dispatched_at_external,
    syncedAt: row.synced_at,
  };
}

export function normalizeShopifyOrder(order) {
  const shippingLine = order?.shippingLines?.nodes?.[0] || {};
  const products = (order?.lineItems?.nodes || []).map((item) => ({
    name: item.name || 'Producto',
    quantity: item.quantity || 1,
    sku: item.sku || '',
    variant: item.variantTitle || '',
  }));
  const fulfillment = (order?.fulfillments || []).find((item) => String(item?.status || '').toUpperCase() === 'SUCCESS') || order?.fulfillments?.[0];

  return {
    shopifyGid: order?.id,
    shopifyLegacyId: String(order?.legacyResourceId || ''),
    name: order?.name || '',
    financialStatus: order?.displayFinancialStatus || '',
    fulfillmentStatus: order?.displayFulfillmentStatus || '',
    cancelReason: order?.cancelReason || '',
    cancelledAtExternal: order?.cancelledAt || '',
    contactName: order?.shippingAddress?.name || order?.customer?.displayName || '',
    contactEmail: order?.email || order?.customer?.email || '',
    contactPhone: order?.phone || order?.shippingAddress?.phone || order?.customer?.phone || '',
    shippingAddressJson: JSON.stringify(order?.shippingAddress || {}),
    productsJson: JSON.stringify(products),
    shippingMethod: shippingLine.title || shippingLine.code || '',
    shippingCarrier: shippingLine.source || shippingLine.carrierIdentifier || '',
    subtotal: moneyAmount(order?.currentSubtotalPriceSet),
    total: moneyAmount(order?.currentTotalPriceSet),
    currency: order?.currencyCode || order?.currentTotalPriceSet?.shopMoney?.currencyCode || '',
    createdAtExternal: order?.createdAt || '',
    updatedAtExternal: order?.updatedAt || '',
    dispatchedAtExternal: fulfillment?.createdAt || '',
  };
}

export async function upsertShopifyOrder(workspaceId, order, { connectionId, externalStoreId } = {}) {
  await ensureDb();
  const normalized = normalizeShopifyOrder(order);
  if (!normalized.shopifyGid) return;

  const existing = await db.execute({
    sql: `SELECT id FROM shopify_orders WHERE integration_connection_id = ? AND shopify_gid = ? LIMIT 1`,
    args: [Number(connectionId), normalized.shopifyGid],
  });
  const args = [
    workspaceId,
    Number(connectionId),
    String(externalStoreId || ''),
    normalized.shopifyGid,
    normalized.shopifyLegacyId,
    normalized.name,
    normalized.financialStatus,
    normalized.fulfillmentStatus,
    normalized.cancelReason,
    normalized.cancelledAtExternal,
    normalized.contactName,
    normalized.contactEmail,
    normalized.contactPhone,
    normalized.shippingAddressJson,
    normalized.productsJson,
    normalized.shippingMethod,
    normalized.shippingCarrier,
    normalized.subtotal,
    normalized.total,
    normalized.currency,
    normalized.createdAtExternal,
    normalized.updatedAtExternal,
    normalized.dispatchedAtExternal,
  ];

  if (existing.rows.length) {
    await db.execute({
      sql: `UPDATE shopify_orders SET
        workspace_id = ?, integration_connection_id = ?, external_store_id = ?, shopify_gid = ?, shopify_legacy_id = ?, name = ?,
        financial_status = ?, fulfillment_status = ?, cancel_reason = ?, cancelled_at_external = ?, contact_name = ?, contact_email = ?,
        contact_phone = ?, shipping_address_json = ?, products_json = ?, shipping_method = ?, shipping_carrier = ?, subtotal = ?,
        total = ?, currency = ?, created_at_external = ?, updated_at_external = ?, dispatched_at_external = ?, synced_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      args: [...args, Number(existing.rows[0].id)],
    });
    return;
  }

  await db.execute({
    sql: `INSERT INTO shopify_orders (
      workspace_id, integration_connection_id, external_store_id, shopify_gid, shopify_legacy_id, name,
      financial_status, fulfillment_status, cancel_reason, cancelled_at_external, contact_name, contact_email,
      contact_phone, shipping_address_json, products_json, shipping_method, shipping_carrier, subtotal,
      total, currency, created_at_external, updated_at_external, dispatched_at_external, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    args,
  });
}

export async function syncShopifyOrders({ workspaceId, client, connectionId, externalStoreId, q = '' } = {}) {
  await ensureDb();
  let after = null;
  let pages = 0;
  let total = 0;
  while (pages < 5) {
    const { orders, pageInfo } = await client.listOrders({ first: 50, after, q });
    for (const order of orders) {
      await upsertShopifyOrder(workspaceId, order, { connectionId, externalStoreId });
      total++;
    }
    if (!pageInfo?.hasNextPage) break;
    after = pageInfo.endCursor;
    pages++;
  }
  return total;
}

export async function listStoredShopifyOrders({ workspaceId, connectionId = '', q = '', limit = 500 } = {}) {
  await ensureDb();
  const conditions = ['workspace_id = ?'];
  const args = [workspaceId];
  conditions.push(`COALESCE(TRIM(shipping_address_json), '') NOT IN ('', '{}', 'null')`);
  conditions.push(`LOWER(COALESCE(fulfillment_status, '')) NOT IN ('fulfilled')`);
  conditions.push(`COALESCE(cancelled_at_external, '') = ''`);
  if (connectionId) {
    conditions.push('integration_connection_id = ?');
    args.push(Number(connectionId));
  }
  if (q) {
    conditions.push('(name LIKE ? OR contact_name LIKE ? OR contact_email LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const result = await db.execute({
    sql: `SELECT * FROM shopify_orders WHERE ${conditions.join(' AND ')} ORDER BY created_at_external DESC LIMIT ?`,
    args: [...args, limit],
  });
  return (result.rows || []).map(mapStoredShopifyRow);
}

export async function getShopifySyncMeta({ workspaceId, connectionId = '' } = {}) {
  await ensureDb();
  const conditions = ['workspace_id = ?'];
  const args = [workspaceId];
  if (connectionId) {
    conditions.push('integration_connection_id = ?');
    args.push(Number(connectionId));
  }
  const result = await db.execute({
    sql: `SELECT MAX(synced_at) AS last_synced_at, COUNT(*) AS total_orders FROM shopify_orders WHERE ${conditions.join(' AND ')}`,
    args,
  });
  const row = result.rows?.[0] || {};
  return { lastSyncedAt: row.last_synced_at || '', totalOrders: Number(row.total_orders || 0) };
}
