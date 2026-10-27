// Daily upkeep of stored Mercado Libre orders: close the ones that already arrived, then read the full detail of the
// recent ones still open so they close when delivered. Closed orders are never fetched again.
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { syncSingleMercadoLibreOrder } from '@/lib/mercadolibreStore';

const execute = (sql, args = []) => db.execute({ sql, args });

// Delivered orders whose stored data already shows the delivery (history event or shipment milestone) cannot change.
export async function closeDeliveredOrders(connectionId, { limit = 5000 } = {}) {
  await ensureDb();
  const result = await execute(`UPDATE mercadolibre_orders SET closed_at = CURRENT_TIMESTAMP WHERE id IN (
    SELECT id FROM mercadolibre_orders WHERE integration_connection_id = ? AND closed_at IS NULL
      AND (shipment_status = 'cancelled' OR (shipment_status = 'delivered'
        AND (history_json LIKE '%"delivered"%' OR raw_shipment_json LIKE '%"date_delivered":"%')))
    LIMIT ?)`, [Number(connectionId), limit]);
  return Number(result.rowsAffected) || 0;
}

export async function refreshOpenOrders(workspaceId, target, { days = 45, deadline = Date.now() + 120_000, concurrency = 5, syncOrder = syncSingleMercadoLibreOrder } = {}) {
  await ensureDb();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const open = (await execute(`SELECT order_id FROM mercadolibre_orders WHERE workspace_id = ? AND integration_connection_id = ? AND closed_at IS NULL
    AND shipment_id <> '' AND created_at_external >= ?
    ORDER BY (history_json IS NULL OR history_json IN ('', '[]')) DESC, synced_at ASC LIMIT 2000`, [workspaceId, Number(target.connectionId), since])).rows;
  const stats = { open: open.length, refreshed: 0, failed: 0 };
  for (let i = 0; i < open.length && Date.now() < deadline; i += concurrency) {
    await Promise.all(open.slice(i, i + concurrency).map(async (row) => {
      try {
        await syncOrder({ workspaceId, client: target.client, orderId: row.order_id, connectionId: target.connectionId,
          externalStoreId: target.externalStoreId, siteId: target.config?.siteId || 'MLA' });
        stats.refreshed++;
      } catch { stats.failed++; }
    }));
  }
  return stats;
}
