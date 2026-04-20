import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';

export function normalizeTiendanubeOrder(order) {
  const shipping = order?.shipping_address || {};
  const shippingOption = order?.shipping_option || order?.shipping || {};
  const shippingMethod = String(
    shippingOption?.name ||
    shippingOption?.option ||
    shippingOption?.service ||
    order?.shipping_method ||
    order?.shipping_method_name ||
    ''
  );
  const shippingCarrier = String(
    shippingOption?.carrier ||
    shippingOption?.carrier_name ||
    order?.shipping_carrier ||
    order?.shipping_carrier_name ||
    ''
  );
  const shippingFingerprint = `${shippingMethod} ${shippingCarrier}`.toLowerCase();
  const isZipnova = /zipnova|zippin/.test(shippingFingerprint) ? 1 : 0;

  return {
    tiendanubeId: order?.id,
    number: String(order?.number || ''),
    status: order?.status || '',
    paymentStatus: order?.payment_status || '',
    shippingStatus: order?.shipping_status || '',
    shippingMethod,
    shippingCarrier,
    isZipnova,
    contactName: order?.contact_name || order?.customer?.name || '',
    contactEmail: order?.contact_email || order?.customer?.email || '',
    contactPhone: order?.contact_phone || order?.customer?.phone || '',
    shippingAddressJson: JSON.stringify(order?.shipping_address || {}),
    productsJson: JSON.stringify(order?.products || []),
    subtotal: String(order?.subtotal || ''),
    total: String(order?.total || ''),
    currency: order?.currency || '',
    createdAtExternal: order?.created_at || '',
    raw: order,
  };
}

export async function upsertTiendanubeOrder(workspaceId, order) {
  await ensureDb();
  const normalized = normalizeTiendanubeOrder(order);
  await db.execute({
    sql: `INSERT INTO tiendanube_orders (
      workspace_id, tiendanube_id, number, status, payment_status, shipping_status,
      shipping_method, shipping_carrier, is_zipnova,
      contact_name, contact_email, contact_phone, shipping_address_json, products_json,
      subtotal, total, currency, created_at_external, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(workspace_id, tiendanube_id) DO UPDATE SET
      number = excluded.number,
      status = excluded.status,
      payment_status = excluded.payment_status,
      shipping_status = excluded.shipping_status,
      shipping_method = excluded.shipping_method,
      shipping_carrier = excluded.shipping_carrier,
      is_zipnova = excluded.is_zipnova,
      contact_name = excluded.contact_name,
      contact_email = excluded.contact_email,
      contact_phone = excluded.contact_phone,
      shipping_address_json = excluded.shipping_address_json,
      products_json = excluded.products_json,
      subtotal = excluded.subtotal,
      total = excluded.total,
      currency = excluded.currency,
      created_at_external = excluded.created_at_external,
      synced_at = CURRENT_TIMESTAMP`,
    args: [
      workspaceId,
      normalized.tiendanubeId,
      normalized.number,
      normalized.status,
      normalized.paymentStatus,
      normalized.shippingStatus,
      normalized.shippingMethod,
      normalized.shippingCarrier,
      normalized.isZipnova,
      normalized.contactName,
      normalized.contactEmail,
      normalized.contactPhone,
      normalized.shippingAddressJson,
      normalized.productsJson,
      normalized.subtotal,
      normalized.total,
      normalized.currency,
      normalized.createdAtExternal,
    ],
  });
}

export async function syncTiendanubeOrders({ workspaceId, client, status = '', paymentStatus = '', q = '' } = {}) {
  await ensureDb();
  if (!client) throw new Error('Cliente de Tiendanube no disponible');

  let page = 1;
  const perPage = 50;
  let hasMore = true;
  let totalSynced = 0;

  while (hasMore && page <= 10) {
    const orders = await client.listOrders({ page, perPage, status, paymentStatus, q });
    const items = Array.isArray(orders) ? orders : [];
    if (items.length === 0) {
      hasMore = false;
      break;
    }
    for (const order of items) {
      await upsertTiendanubeOrder(workspaceId, order);
      totalSynced++;
    }
    hasMore = items.length === perPage;
    page++;
  }

  return totalSynced;
}

export async function listStoredTiendanubeOrders({ workspaceId, status = '', paymentStatus = '', q = '', limit = 500 } = {}) {
  await ensureDb();
  const conditions = ['workspace_id = ?'];
  const args = [workspaceId];

  // Vista operativa: solo pedidos que pasan por Zipnova/Zippin.
  // Excluye automáticamente envíos digitales, retiro en local y otros couriers.
  conditions.push(`(
    COALESCE(is_zipnova, 0) = 1
    OR LOWER(COALESCE(shipping_method, '') || ' ' || COALESCE(shipping_carrier, '')) LIKE '%zipnova%'
    OR LOWER(COALESCE(shipping_method, '') || ' ' || COALESCE(shipping_carrier, '')) LIKE '%zippin%'
  )`);

  if (status) {
    conditions.push('status = ?');
    args.push(status);
  }
  if (paymentStatus) {
    conditions.push('payment_status = ?');
    args.push(paymentStatus);
  }
  if (q) {
    conditions.push('(number LIKE ? OR contact_name LIKE ? OR contact_email LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const where = conditions.join(' AND ');
  const result = await db.execute({
    sql: `SELECT * FROM tiendanube_orders WHERE ${where} ORDER BY created_at_external DESC LIMIT ?`,
    args: [...args, limit],
  });

  return (result.rows || []).map((row) => ({
    id: Number(row.tiendanube_id),
    number: row.number,
    status: row.status,
    paymentStatus: row.payment_status,
    shippingStatus: row.shipping_status,
    shippingMethod: row.shipping_method || '',
    shippingCarrier: row.shipping_carrier || '',
    isZipnova: Boolean(row.is_zipnova),
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    shippingAddress: JSON.parse(row.shipping_address_json || '{}'),
    products: JSON.parse(row.products_json || '[]'),
    subtotal: row.subtotal,
    total: row.total,
    currency: row.currency,
    createdAt: row.created_at_external,
    syncedAt: row.synced_at,
  }));
}

export async function getStoredTiendanubeOrder({ workspaceId, id }) {
  await ensureDb();
  const result = await db.execute({
    sql: `SELECT * FROM tiendanube_orders WHERE workspace_id = ? AND tiendanube_id = ? LIMIT 1`,
    args: [workspaceId, id],
  });
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    id: Number(row.tiendanube_id),
    number: row.number,
    status: row.status,
    paymentStatus: row.payment_status,
    shippingStatus: row.shipping_status,
    shippingMethod: row.shipping_method || '',
    shippingCarrier: row.shipping_carrier || '',
    isZipnova: Boolean(row.is_zipnova),
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    shippingAddress: JSON.parse(row.shipping_address_json || '{}'),
    products: JSON.parse(row.products_json || '[]'),
    subtotal: row.subtotal,
    total: row.total,
    currency: row.currency,
    createdAt: row.created_at_external,
    syncedAt: row.synced_at,
  };
}
