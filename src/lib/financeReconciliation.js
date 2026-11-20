import { db } from './db';
import { syncSingleMercadoLibreOrder } from './mercadolibreStore';
import { mercadoLibreNotificationResource } from './mercadolibreWebhook.js';

export async function reconcileMercadoLibreFinance(workspaceId, target, limit = 25) {
  const connectionId = Number(target.connectionId);
  // Revisit old open shipments, terminal shipments missing detail/costs, and durable failures.
  // Oldest attempt first prevents recent orders from starving older shipments.
  const result = await db.execute({ sql: `SELECT mo.order_id, MIN(COALESCE(r.updated_at,f.last_attempt_at,'1970-01-01')) AS last_attempt
    FROM mercadolibre_orders mo
    LEFT JOIN shipment_finance f ON f.workspace_id=mo.workspace_id AND f.connection_id=mo.integration_connection_id AND f.shipment_id=mo.shipment_id
    LEFT JOIN ml_sync_retries r ON r.workspace_id=mo.workspace_id AND r.connection_id=mo.integration_connection_id AND r.order_id=mo.order_id
    WHERE mo.workspace_id=? AND mo.integration_connection_id=? AND mo.shipment_id<>''
      AND (r.next_attempt_at IS NULL OR r.next_attempt_at<=CURRENT_TIMESTAMP)
      AND (r.order_id IS NOT NULL OR COALESCE(mo.shipment_status,'') NOT IN ('delivered','cancelled','canceled')
        OR f.details_synced_at IS NULL OR f.costs_json IS NULL OR f.sync_error IS NOT NULL)
    GROUP BY mo.shipment_id ORDER BY last_attempt ASC LIMIT ?`, args: [workspaceId, connectionId, limit] });
  const orphaned = await db.execute({ sql: `SELECT r.order_id FROM ml_sync_retries r
    WHERE r.workspace_id=? AND r.connection_id=? AND r.next_attempt_at<=CURRENT_TIMESTAMP
      AND NOT EXISTS(SELECT 1 FROM mercadolibre_orders mo WHERE mo.workspace_id=r.workspace_id AND mo.integration_connection_id=r.connection_id AND mo.order_id=r.order_id)
    ORDER BY r.updated_at LIMIT 5`, args: [workspaceId, connectionId] });
  const outcomes = [];
  for (const row of [...orphaned.rows, ...result.rows]) {
    try {
      const full = await syncSingleMercadoLibreOrder({ workspaceId, client: target.client, orderId: row.order_id, connectionId, externalStoreId: target.externalStoreId, siteId: target.config?.siteId || 'MLA' });
      outcomes.push({ orderId: row.order_id, ok: !full.syncErrors?.length });
    } catch (error) { outcomes.push({ orderId: row.order_id, ok: false, error: error.message }); }
  }
  return outcomes;
}

export async function recoverMercadoLibreNotifications(workspaceId, target, limit = 15) {
  const result = await db.execute({ sql: `SELECT n.id,n.topic,n.resource FROM mercadolibre_notifications n
    LEFT JOIN ml_notification_retries r ON r.notification_id=n.id
    WHERE n.processed_at IS NULL AND n.user_id=? AND n.topic IN ('orders','orders_v2','shipments','flex-handshakes')
      AND (r.next_attempt_at IS NULL OR r.next_attempt_at<=CURRENT_TIMESTAMP)
    ORDER BY COALESCE(r.updated_at,'1970-01-01'),n.id LIMIT ?`, args: [String(target.externalStoreId), limit] });
  for (const notification of result.rows) {
    await processMercadoLibreNotification(workspaceId, target, notification);
  }
}

async function notificationOrderIds(workspaceId, target, notification) {
  const resource = mercadoLibreNotificationResource(notification.topic, String(notification.resource || ''));
  if (resource?.orderId) return [resource.orderId];
  if (!resource?.shipmentId) return [];

  const { shipmentId } = resource;
  const stored = await db.execute({
    sql: `SELECT order_id FROM mercadolibre_orders WHERE workspace_id=? AND integration_connection_id=? AND shipment_id=?`,
    args: [workspaceId, Number(target.connectionId), shipmentId],
  });
  if (stored.rows.length) return [...new Set(stored.rows.map((row) => String(row.order_id)))];

  // El detalle de envíos ya no siempre devuelve external_reference.
  const result = await target.client.getShipmentOrders(shipmentId).catch(() => null);
  const orders = Array.isArray(result) ? result : result?.orders;
  if (Array.isArray(orders)) {
    const ids = orders.map((order) => String(order?.order_id || order?.id || '')).filter((id) => /^\d{1,20}$/.test(id));
    if (ids.length) return [...new Set(ids)];
  }
  const shipment = await target.client.getShipment(shipmentId);
  const legacyId = String(shipment?.external_reference || '');
  return /^\d{1,20}$/.test(legacyId) ? [legacyId] : [];
}

export async function processMercadoLibreNotification(workspaceId, target, notification) {
  // El webhook y el cron comparten la cola. Reservar el aviso mientras se procesa.
  const lease = await db.execute({
    sql: `INSERT INTO ml_notification_retries(notification_id,last_error,next_attempt_at)
          SELECT n.id,'',datetime('now','+5 minutes') FROM mercadolibre_notifications n
          WHERE n.id=? AND n.user_id=? AND n.processed_at IS NULL
          ON CONFLICT(notification_id) DO UPDATE SET next_attempt_at=excluded.next_attempt_at
          WHERE ml_notification_retries.next_attempt_at IS NULL OR ml_notification_retries.next_attempt_at<=CURRENT_TIMESTAMP
          RETURNING notification_id`,
    args: [notification.id, String(target.externalStoreId)],
  });
  if (!lease.rows.length) return;

  try {
    const orderIds = await notificationOrderIds(workspaceId, target, notification);
    if (!orderIds.length) throw new Error('Notificación sin orden asociada todavía');
    for (const orderId of orderIds) {
      const full = await syncSingleMercadoLibreOrder({
        workspaceId, client: target.client, orderId, connectionId: target.connectionId,
        externalStoreId: target.externalStoreId, siteId: target.config?.siteId || 'MLA',
      });
      if (!full?.order || full.syncErrors?.length) {
        throw new Error(full?.syncErrors?.join('; ') || 'Mercado Libre no devolvió la orden');
      }
    }
    await db.batch([
      { sql: 'UPDATE mercadolibre_notifications SET processed_at=CURRENT_TIMESTAMP WHERE id=?', args: [notification.id] },
      { sql: 'DELETE FROM ml_notification_retries WHERE notification_id=?', args: [notification.id] },
    ], 'write');
  } catch (error) {
    await db.execute({
      sql: `UPDATE ml_notification_retries
            SET attempts=attempts+1,last_error=?,next_attempt_at=datetime('now','+1 hour'),updated_at=CURRENT_TIMESTAMP
            WHERE notification_id=?`,
      args: [String(error.message).slice(0, 2000), notification.id],
    });
  }
}
