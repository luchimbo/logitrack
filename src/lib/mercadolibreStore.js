import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { assignCarrier } from '@/lib/zoneMapper';
import { parseZplFile, resolvePartidoFromGeo } from '@/lib/zplParser';
import { getArgentinaDateString } from '@/lib/dateUtils';
import { deriveMercadoLibreLogistics } from '@/lib/mercadolibreLogistics';

function json(value, fallback) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeProduct(item = {}) {
  const product = item.item || item;
  return {
    itemId: product.id || item.item_id || '',
    name: product.title || item.description || 'Producto',
    quantity: Number(item.quantity || 1),
    sku: product.seller_sku || product.seller_custom_field || item.seller_sku || '',
    variationId: product.variation_id || item.variation_id || '',
    variationAttributes: product.variation_attributes || [],
  };
}

function mapOrderRow(row) {
  const leadTime = parseJson(row.lead_time_json, {});
  const carrier = parseJson(row.carrier_json, null);
  const history = parseJson(row.history_json, []);
  const logisticType = row.logistic_type || '';
  const shipmentStatus = row.shipment_status || '';
  const shipmentSubstatus = row.shipment_substatus || '';
  const logistics = deriveMercadoLibreLogistics({
    shipmentId: row.shipment_id || '',
    shipmentStatus,
    shipmentSubstatus,
    logisticType,
    shippingMethod: row.shipping_method || '',
    leadTime,
    delays: parseJson(row.delays_json, null),
    carrier,
    history,
    labelImportedAt: row.label_imported_at || '',
    shipmentRowId: row.shipment_row_id ? Number(row.shipment_row_id) : null,
    labelDispatchDate: row.imported_dispatch_date || '',
  });

  return {
    id: row.order_id,
    connectionId: row.integration_connection_id ? Number(row.integration_connection_id) : null,
    externalStoreId: row.external_store_id || '',
    userId: row.user_id || '',
    siteId: row.site_id || 'MLA',
    packId: row.pack_id || '',
    shipmentId: row.shipment_id || '',
    status: row.status || '',
    tags: parseJson(row.tags_json, []),
    total: row.total || '',
    currency: row.currency || '',
    buyerId: row.buyer_id || '',
    buyerNickname: row.buyer_nickname || '',
    recipientName: row.recipient_name || '',
    recipientPhone: row.recipient_phone || '',
    address: parseJson(row.address_json, {}),
    products: parseJson(row.products_json, []),
    shipmentStatus,
    shipmentSubstatus,
    logisticMode: row.logistic_mode || '',
    logisticType,
    shippingMethod: row.shipping_method || '',
    trackingNumber: row.tracking_number || '',
    leadTime,
    delays: parseJson(row.delays_json, null),
    carrier,
    history,
    labelImportedAt: row.label_imported_at || '',
    shipmentRowId: row.shipment_row_id ? Number(row.shipment_row_id) : null,
    createdAt: row.created_at_external || '',
    updatedAt: row.updated_at_external || '',
    syncedAt: row.synced_at || '',
    cutoff: logistics.cutoff?.value || '',
    cutoffDetail: logistics.cutoff,
    packageState: logistics.packageState,
    printability: logistics.printability,
    timeline: logistics.timeline,
    dispatchState: logistics.dispatchState,
  };
}

function getAddress(shipment = {}) {
  return shipment?.destination?.shipping_address || {};
}

function getShippingMethod(shipment = {}) {
  const type = String(shipment.logistic?.type || '').toLowerCase();
  if (type === 'self_service') return 'flex';
  return 'colecta';
}

function normalizeOrder({ order, shipment, shipmentItems = [], leadTime = null, delays = null, carrier = null, history = [], siteId = 'MLA' }) {
  const address = getAddress(shipment);
  const products = Array.isArray(order?.order_items) && order.order_items.length
    ? order.order_items.map(normalizeProduct)
    : (Array.isArray(shipmentItems) ? shipmentItems.map(normalizeProduct) : []);

  return {
    orderId: String(order?.id || ''),
    packId: order?.pack_id ? String(order.pack_id) : '',
    shipmentId: order?.shipping?.id ? String(order.shipping.id) : shipment?.id ? String(shipment.id) : '',
    userId: order?.seller?.id ? String(order.seller.id) : '',
    siteId: order?.context?.site || shipment?.source?.site_id || siteId || 'MLA',
    status: order?.status || '',
    tagsJson: json(order?.tags, []),
    total: String(order?.total_amount ?? order?.paid_amount ?? ''),
    currency: order?.currency_id || '',
    buyerId: order?.buyer?.id ? String(order.buyer.id) : '',
    buyerNickname: order?.buyer?.nickname || '',
    recipientName: shipment?.destination?.receiver_name || order?.buyer?.nickname || '',
    recipientPhone: shipment?.destination?.receiver_phone || '',
    addressJson: json(address, {}),
    productsJson: json(products, []),
    shipmentStatus: shipment?.status || '',
    shipmentSubstatus: shipment?.substatus || '',
    logisticMode: shipment?.logistic?.mode || '',
    logisticType: shipment?.logistic?.type || '',
    shippingMethod: getShippingMethod(shipment),
    trackingNumber: shipment?.tracking_number || '',
    leadTimeJson: json(leadTime || shipment?.lead_time || {}, {}),
    delaysJson: json(delays, null),
    carrierJson: json(carrier, null),
    historyJson: json(history, []),
    rawOrderJson: json(order, {}),
    rawShipmentJson: json(shipment, {}),
    createdAtExternal: order?.date_created || shipment?.date_created || '',
    updatedAtExternal: order?.last_updated || order?.date_last_updated || shipment?.last_updated || '',
  };
}

export async function upsertMercadoLibreOrder(workspaceId, payload, { connectionId, externalStoreId, siteId = 'MLA' } = {}) {
  await ensureDb();
  const normalized = normalizeOrder({ ...payload, siteId });
  if (!normalized.orderId) return;
  const resolvedConnectionId = connectionId ? Number(connectionId) : null;
  const existing = await db.execute({
    sql: `SELECT id, label_imported_at, shipment_row_id FROM mercadolibre_orders WHERE integration_connection_id = ? AND order_id = ? LIMIT 1`,
    args: [resolvedConnectionId, normalized.orderId],
  });
  const values = [
    workspaceId,
    resolvedConnectionId,
    String(externalStoreId || ''),
    normalized.userId,
    normalized.siteId,
    normalized.orderId,
    normalized.packId,
    normalized.shipmentId,
    normalized.status,
    normalized.tagsJson,
    normalized.total,
    normalized.currency,
    normalized.buyerId,
    normalized.buyerNickname,
    normalized.recipientName,
    normalized.recipientPhone,
    normalized.addressJson,
    normalized.productsJson,
    normalized.shipmentStatus,
    normalized.shipmentSubstatus,
    normalized.logisticMode,
    normalized.logisticType,
    normalized.shippingMethod,
    normalized.trackingNumber,
    normalized.leadTimeJson,
    normalized.delaysJson,
    normalized.carrierJson,
    normalized.historyJson,
    normalized.rawOrderJson,
    normalized.rawShipmentJson,
    normalized.createdAtExternal,
    normalized.updatedAtExternal,
  ];

  if (existing.rows.length) {
    await db.execute({
      sql: `UPDATE mercadolibre_orders SET
        workspace_id = ?, integration_connection_id = ?, external_store_id = ?, user_id = ?, site_id = ?, order_id = ?, pack_id = ?, shipment_id = ?,
        status = ?, tags_json = ?, total = ?, currency = ?, buyer_id = ?, buyer_nickname = ?, recipient_name = ?, recipient_phone = ?,
        address_json = ?, products_json = ?, shipment_status = ?, shipment_substatus = ?, logistic_mode = ?, logistic_type = ?, shipping_method = ?,
        tracking_number = ?, lead_time_json = ?, delays_json = ?, carrier_json = ?, history_json = ?, raw_order_json = ?, raw_shipment_json = ?,
        created_at_external = ?, updated_at_external = ?, synced_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      args: [...values, Number(existing.rows[0].id)],
    });
    return;
  }

  await db.execute({
    sql: `INSERT INTO mercadolibre_orders (
      workspace_id, integration_connection_id, external_store_id, user_id, site_id, order_id, pack_id, shipment_id,
      status, tags_json, total, currency, buyer_id, buyer_nickname, recipient_name, recipient_phone,
      address_json, products_json, shipment_status, shipment_substatus, logistic_mode, logistic_type, shipping_method,
      tracking_number, lead_time_json, delays_json, carrier_json, history_json, raw_order_json, raw_shipment_json,
      created_at_external, updated_at_external, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    args: values,
  });
}

async function getFlexConfigCached(client, { siteId, userId, cache }) {
  if (!client.getFlexConfigurationForUser || !siteId || !userId) return null;
  const key = `${siteId}:${userId}`;
  if (cache?.has(key)) return cache.get(key);
  const config = await client.getFlexConfigurationForUser({ siteId, userId }).catch(() => null);
  if (cache) cache.set(key, config);
  return config;
}

async function fetchFullOrder(client, orderSummary, siteId, { flexConfigCache = new Map() } = {}) {
  const order = orderSummary?.id ? await client.getOrder(orderSummary.id) : orderSummary;
  const shipmentId = order?.shipping?.id;
  let shipment = null;
  let shipmentItems = [];
  let leadTime = null;
  let delays = null;
  let carrier = null;
  let history = [];
  if (shipmentId) {
    shipment = await client.getShipment(shipmentId);
    shipmentItems = await client.getShipmentItems(shipmentId).catch(() => []);
    leadTime = await client.getShipmentLeadTime(shipmentId).catch(() => null);
    delays = await client.getShipmentDelays(shipmentId);
    carrier = await client.getShipmentCarrier(shipmentId);
    history = await client.getShipmentHistory(shipmentId);
    if (shipment?.logistic?.type === 'self_service') {
      const assignment = await client.getFlexAssignment({ siteId: shipment?.source?.site_id || siteId, shipmentId });
      const flexConfig = await getFlexConfigCached(client, {
        siteId: shipment?.source?.site_id || siteId,
        userId: order?.seller?.id || shipment?.sender_id,
        cache: flexConfigCache,
      });
      if (assignment || flexConfig) carrier = { ...(carrier || {}), flex_assignment: assignment, flex_config: flexConfig };
    }
  }
  return { order, shipment, shipmentItems, leadTime, delays, carrier, history };
}

export async function syncMercadoLibreOrders({ workspaceId, client, connectionId, externalStoreId, siteId = 'MLA', q = '' } = {}) {
  await ensureDb();
  const sellerId = externalStoreId;
  if (!sellerId) throw new Error('Seller ID de Mercado Libre no disponible');
  let offset = 0;
  const limit = 50;
  let totalSynced = 0;
  let pages = 0;
  const flexConfigCache = new Map();
  while (pages < 5) {
    const payload = await client.searchOrders({ sellerId, offset, limit, q });
    const orders = Array.isArray(payload?.results) ? payload.results : [];
    for (const orderSummary of orders) {
      const full = await fetchFullOrder(client, orderSummary, siteId, { flexConfigCache });
      await upsertMercadoLibreOrder(workspaceId, full, { connectionId, externalStoreId, siteId });
      totalSynced++;
    }
    if (orders.length < limit) break;
    offset += limit;
    pages++;
  }
  return totalSynced;
}

export async function listStoredMercadoLibreOrders({ workspaceId, connectionId = '', q = '', view = '', limit = 500 } = {}) {
  await ensureDb();
  const conditions = ['mo.workspace_id = ?'];
  const args = [workspaceId];
  if (connectionId) {
    conditions.push('mo.integration_connection_id = ?');
    args.push(Number(connectionId));
  }
  if (q) {
    conditions.push('(mo.order_id LIKE ? OR mo.shipment_id LIKE ? OR mo.recipient_name LIKE ? OR mo.tracking_number LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (view === 'ready') conditions.push(`LOWER(COALESCE(mo.shipment_status, '')) = 'ready_to_ship'`);
  if (view === 'printable') conditions.push(`(mo.label_imported_at IS NOT NULL OR (LOWER(COALESCE(mo.shipment_status, '')) = 'ready_to_ship' AND LOWER(COALESCE(mo.shipment_substatus, '')) IN ('', 'ready_to_print', 'printed')))`);
  if (view === 'no_label') conditions.push(`mo.label_imported_at IS NULL AND NOT (LOWER(COALESCE(mo.shipment_status, '')) = 'ready_to_ship' AND LOWER(COALESCE(mo.shipment_substatus, '')) IN ('', 'ready_to_print', 'printed'))`);
  if (view === 'flex') conditions.push(`LOWER(COALESCE(mo.logistic_type, '')) = 'self_service'`);
  if (view === 'colecta') conditions.push(`LOWER(COALESCE(mo.logistic_type, '')) != 'self_service'`);
  if (view === 'delayed') conditions.push(`(LOWER(COALESCE(mo.shipment_substatus, '')) LIKE '%delayed%' OR COALESCE(mo.delays_json, 'null') NOT IN ('', 'null'))`);
  if (view === 'imported') conditions.push(`mo.label_imported_at IS NOT NULL`);
  if (view === 'to_dispatch') conditions.push(`(mo.label_imported_at IS NOT NULL OR mo.shipment_row_id IS NOT NULL) AND LOWER(COALESCE(mo.shipment_status, '')) NOT IN ('shipped','delivered','in_transit','cancelled','canceled') AND LOWER(COALESCE(mo.shipment_substatus, '')) NOT IN ('picked_up','in_hub','in_transit','out_for_delivery','deliver_attempt','waiting_for_pickup','ready_to_pickup','me2_in_transit','me2_picked_up','authorized_by_carrier')`);
  if (view === 'dispatched_today') conditions.push(`date(mo.label_imported_at) = date('now','localtime')`);
  if (view === 'in_transit') conditions.push(`(LOWER(COALESCE(mo.shipment_status, '')) IN ('shipped','in_transit') OR LOWER(COALESCE(mo.shipment_substatus, '')) IN ('picked_up','in_hub','in_transit','out_for_delivery','deliver_attempt','waiting_for_pickup','ready_to_pickup','me2_in_transit','me2_picked_up','authorized_by_carrier'))`);
  if (view === 'delivered') conditions.push(`LOWER(COALESCE(mo.shipment_status, '')) = 'delivered'`);
  if (view === 'scanned') conditions.push(`(LOWER(COALESCE(mo.shipment_status, '')) IN ('shipped','delivered','in_transit') OR LOWER(COALESCE(mo.shipment_substatus, '')) IN ('picked_up','in_hub','in_transit','out_for_delivery','deliver_attempt','waiting_for_pickup','ready_to_pickup','me2_in_transit','me2_picked_up','authorized_by_carrier'))`);
  if (view === 'not_scanned') conditions.push(`LOWER(COALESCE(mo.shipment_status, '')) NOT IN ('shipped','delivered','in_transit') AND LOWER(COALESCE(mo.shipment_substatus, '')) NOT IN ('picked_up','in_hub','in_transit','out_for_delivery','deliver_attempt','waiting_for_pickup','ready_to_pickup','me2_in_transit','me2_picked_up','authorized_by_carrier')`);

  const result = await db.execute({
    sql: `SELECT mo.*, s.dispatch_date AS imported_dispatch_date, s.delivery_date AS imported_delivery_date
          FROM mercadolibre_orders mo
          LEFT JOIN shipments s ON s.workspace_id = mo.workspace_id AND s.id = mo.shipment_row_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY mo.created_at_external DESC LIMIT ?`,
    args: [...args, limit],
  });
  return (result.rows || []).map(mapOrderRow);
}

export async function getMercadoLibreSyncMeta({ workspaceId, connectionId = '' } = {}) {
  await ensureDb();
  const conditions = ['workspace_id = ?'];
  const args = [workspaceId];
  if (connectionId) {
    conditions.push('integration_connection_id = ?');
    args.push(Number(connectionId));
  }
  const result = await db.execute({
    sql: `SELECT MAX(synced_at) AS last_synced_at, COUNT(*) AS total_orders FROM mercadolibre_orders WHERE ${conditions.join(' AND ')}`,
    args,
  });
  const row = result.rows?.[0] || {};
  return { lastSyncedAt: row.last_synced_at || '', totalOrders: Number(row.total_orders || 0) };
}

async function extractZplLabelsFromZip(arrayBuffer) {
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(new Uint8Array(arrayBuffer));
  const labels = [];
  for (const [name, data] of Object.entries(files)) {
    if (!/\.(txt|zpl)$/i.test(name)) continue;
    labels.push(strFromU8(data));
  }
  return labels;
}

async function saveImportedMercadoLibreShipment({ workspaceId, order, shipment, connectionId }) {
  const today = getArgentinaDateString();
  let batchId;
  const batchResult = await db.execute({
    sql: 'SELECT id, filenames FROM daily_batches WHERE workspace_id = ? AND date = ? LIMIT 1',
    args: [workspaceId, today],
  });
  if (batchResult.rows.length) {
    batchId = Number(batchResult.rows[0].id);
    const filenames = new Set(String(batchResult.rows[0].filenames || '').split(', ').filter(Boolean));
    filenames.add('Mercado Libre API');
    await db.execute({ sql: 'UPDATE daily_batches SET filenames = ? WHERE id = ? AND workspace_id = ?', args: [[...filenames].join(', '), batchId, workspaceId] });
  } else {
    const inserted = await db.execute({
      sql: 'INSERT INTO daily_batches (workspace_id, date, filenames) VALUES (?, ?, ?)',
      args: [workspaceId, today, 'Mercado Libre API'],
    });
    batchId = Number(inserted.lastInsertRowid);
  }

  const isFlex = shipment.shipping_method === 'flex' || order.logisticType === 'self_service' || order.shippingMethod === 'flex';
  if (isFlex) {
    shipment.shipping_method = 'flex';
    if (!shipment.partido) {
      const addr = order.address || {};
      const city = addr.city?.name || addr.municipality?.name || '';
      const province = addr.state?.name || '';
      if (city || province) {
        shipment.partido = resolvePartidoFromGeo(city, province);
      }
      if (!shipment.partido && addr.zip_code) {
        shipment.postal_code = shipment.postal_code || addr.zip_code;
      }
    }
    if (!shipment.city) shipment.city = order.address?.city?.name || '';
    if (!shipment.province) shipment.province = order.address?.state?.name || '';
  }
  if (shipment.partido) {
    shipment.assigned_carrier = await assignCarrier(shipment.partido, workspaceId);
  }

  const existing = await db.execute({
    sql: `SELECT id FROM shipments WHERE workspace_id = ? AND (external_shipment_id = ? OR tracking_number = ?) LIMIT 1`,
    args: [workspaceId, order.shipmentId, shipment.tracking_number || order.trackingNumber || ''],
  });

  const products = Array.isArray(order.products) ? order.products : [];
  const fallbackProduct = products[0] || {};
  const address = order.address || {};
  const values = [
    batchId,
    workspaceId,
    shipment.sale_type || (order.packId ? 'Pack' : 'Venta'),
    shipment.sale_id || order.id,
    shipment.tracking_number || order.trackingNumber,
    shipment.remitente_id || order.userId,
    shipment.product_name || products.map((item) => item.name).filter(Boolean).join(' | ') || 'Producto Mercado Libre',
    shipment.sku || fallbackProduct.sku || '',
    shipment.color || '',
    shipment.voltage || '',
    shipment.quantity || fallbackProduct.quantity || 1,
    shipment.recipient_name || order.recipientName,
    shipment.recipient_user || order.buyerNickname,
    shipment.address || address.address_line || [address.street_name, address.street_number].filter(Boolean).join(' '),
    shipment.postal_code || address.zip_code || '',
    shipment.city || address.city?.name || '',
    shipment.partido || '',
    shipment.province || address.state?.name || '',
    shipment.reference || address.comment || '',
    shipment.shipping_method || order.shippingMethod || 'colecta',
    shipment.carrier_code || '',
    shipment.carrier_name || order.carrier?.name || '',
    shipment.assigned_carrier || null,
    shipment.dispatch_date || '',
    shipment.delivery_date || order.leadTime?.estimated_delivery_time?.date || '',
    shipment.raw_zpl,
    'mercadolibre',
    order.id,
    order.shipmentId,
    Number(connectionId),
  ];

  let shipmentRowId;
  if (existing.rows.length) {
    shipmentRowId = Number(existing.rows[0].id);
    await db.execute({
      sql: `UPDATE shipments SET
        batch_id = ?, workspace_id = ?, sale_type = ?, sale_id = ?, tracking_number = ?, remitente_id = ?, product_name = ?, sku = ?, color = ?, voltage = ?,
        quantity = ?, recipient_name = ?, recipient_user = ?, address = ?, postal_code = ?, city = ?, partido = ?, province = ?, reference = ?,
        shipping_method = ?, carrier_code = ?, carrier_name = ?, assigned_carrier = ?, dispatch_date = ?, delivery_date = ?, raw_zpl = ?,
        external_provider = ?, external_order_id = ?, external_shipment_id = ?, integration_connection_id = ?
        WHERE id = ? AND workspace_id = ?`,
      args: [...values, shipmentRowId, workspaceId],
    });
  } else {
    const inserted = await db.execute({
      sql: `INSERT INTO shipments (
        batch_id, workspace_id, sale_type, sale_id, tracking_number, remitente_id, product_name, sku, color, voltage,
        quantity, recipient_name, recipient_user, address, postal_code, city, partido, province, reference,
        shipping_method, carrier_code, carrier_name, assigned_carrier, dispatch_date, delivery_date, raw_zpl,
        external_provider, external_order_id, external_shipment_id, integration_connection_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
      args: values,
    });
    shipmentRowId = Number(inserted.lastInsertRowid);
  }

  await db.execute({
    sql: 'UPDATE daily_batches SET total_packages = (SELECT COUNT(*) FROM shipments WHERE workspace_id = ? AND batch_id = ?) WHERE id = ? AND workspace_id = ?',
    args: [workspaceId, batchId, batchId, workspaceId],
  });
  await db.execute({
    sql: 'UPDATE mercadolibre_orders SET label_imported_at = CURRENT_TIMESTAMP, shipment_row_id = ? WHERE workspace_id = ? AND integration_connection_id = ? AND order_id = ?',
    args: [shipmentRowId, workspaceId, Number(connectionId), String(order.id)],
  });
  return { shipmentRowId, batchId };
}

function findParsedShipmentForOrder(parsed, order, { allowSingleFallback = true } = {}) {
  return parsed.find((item) => String(item.tracking_number || '') === String(order.trackingNumber || ''))
    || parsed.find((item) => String(item.sale_id || '') === String(order.id || ''))
    || (allowSingleFallback && parsed.length === 1 ? parsed[0] : null);
}

async function importOrderWithParsedLabels({ workspaceId, order, parsed, connectionId, allowSingleFallback = true }) {
  if (!order.shipmentId) throw new Error('La orden no tiene shipment_id');
  const shipment = findParsedShipmentForOrder(parsed, order, { allowSingleFallback });
  if (!shipment?.raw_zpl) throw new Error('No se pudo extraer ZPL de la etiqueta Mercado Libre');
  return saveImportedMercadoLibreShipment({ workspaceId, order, shipment, connectionId });
}

async function getStoredMercadoLibreOrder({ workspaceId, connectionId, orderId }) {
  const result = await db.execute({
    sql: `SELECT mo.*, s.dispatch_date AS imported_dispatch_date, s.delivery_date AS imported_delivery_date
          FROM mercadolibre_orders mo
          LEFT JOIN shipments s ON s.workspace_id = mo.workspace_id AND s.id = mo.shipment_row_id
          WHERE mo.workspace_id = ? AND mo.integration_connection_id = ? AND mo.order_id = ? LIMIT 1`,
    args: [workspaceId, Number(connectionId), String(orderId)],
  });
  if (!result.rows.length) throw new Error('Orden Mercado Libre no encontrada');
  return mapOrderRow(result.rows[0]);
}

export async function importMercadoLibreLabel({ workspaceId, client, orderId, connectionId } = {}) {
  await ensureDb();
  const order = await getStoredMercadoLibreOrder({ workspaceId, connectionId, orderId });
  if (!order.shipmentId) throw new Error('La orden no tiene shipment_id');

  const buffer = await client.downloadShipmentLabelsZpl([order.shipmentId]);
  const zplFiles = await extractZplLabelsFromZip(buffer);
  const parsed = zplFiles.flatMap((content) => parseZplFile(content));
  return importOrderWithParsedLabels({ workspaceId, order, parsed, connectionId });
}

function skippedOrder(order, reason) {
  return {
    orderId: order?.id || '',
    shipmentId: order?.shipmentId || '',
    reason,
    status: order?.shipmentStatus || '',
    substatus: order?.shipmentSubstatus || '',
  };
}

export async function importMercadoLibreLabels({ workspaceId, client, orders = [], connectionId } = {}) {
  await ensureDb();
  const pendingOrders = (Array.isArray(orders) ? orders : [])
    .filter((order) => order?.shipmentId)
    .filter((order) => !order.shipmentRowId);
  const skipped = (Array.isArray(orders) ? orders : [])
    .filter((order) => !order?.shipmentId)
    .map((order) => skippedOrder(order, 'La orden no tiene shipment_id'));
  const imported = [];

  for (let i = 0; i < pendingOrders.length; i += 50) {
    const chunk = pendingOrders.slice(i, i + 50);
    const shipmentIds = chunk.map((order) => order.shipmentId);
    try {
      const buffer = await client.downloadShipmentLabelsZpl(shipmentIds);
      const zplFiles = await extractZplLabelsFromZip(buffer);
      const parsed = zplFiles.flatMap((content) => parseZplFile(content));
      for (const order of chunk) {
        try {
          const result = await importOrderWithParsedLabels({ workspaceId, order, parsed, connectionId, allowSingleFallback: false });
          imported.push({ orderId: order.id, ...result });
        } catch (error) {
          try {
            const result = await importMercadoLibreLabel({ workspaceId, client, orderId: order.id, connectionId });
            imported.push({ orderId: order.id, ...result });
          } catch (individualError) {
            skipped.push(skippedOrder(order, individualError.message || error.message || 'No se pudo importar la etiqueta'));
          }
        }
      }
    } catch (chunkError) {
      for (const order of chunk) {
        try {
          const result = await importMercadoLibreLabel({ workspaceId, client, orderId: order.id, connectionId });
          imported.push({ orderId: order.id, ...result });
        } catch (error) {
          skipped.push(skippedOrder(order, error.message || chunkError.message || 'No se pudo importar la etiqueta'));
        }
      }
    }
  }

  return { imported, skipped };
}
