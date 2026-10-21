import { db } from './db';
import { createFinanceRepository } from './financeRepository';
import { shipmentFinanceStatement } from './logisticsFinance';

export async function enqueueMercadoLibreRetry({ workspaceId, connectionId, orderId, error }) {
  if (!connectionId || !orderId) return;
  await db.execute({ sql: `INSERT INTO ml_sync_retries(workspace_id,connection_id,order_id,last_error)
    VALUES(?,?,?,?) ON CONFLICT(workspace_id,connection_id,order_id) DO UPDATE SET
    attempts=ml_sync_retries.attempts+1,last_error=excluded.last_error,updated_at=CURRENT_TIMESTAMP,
    next_attempt_at=datetime('now', '+' || MIN(3600, 60 * (ml_sync_retries.attempts + 1)) || ' seconds')`,
  args: [workspaceId, Number(connectionId), String(orderId), String(error).slice(0, 2000)] });
}

export async function persistShipmentFinance(workspaceId, payload, connectionId) {
  const shipmentId = String(payload.shipment?.id || payload.order?.shipping?.id || '');
  if (!shipmentId || !connectionId) return;
  const errors = payload.syncErrors || [];
  await db.execute(shipmentFinanceStatement(workspaceId,payload,connectionId));
  if (errors.length) await enqueueMercadoLibreRetry({ workspaceId, connectionId, orderId: payload.order?.id, error: errors.join('; ') });
  else if (!payload.light) await db.execute({ sql: 'DELETE FROM ml_sync_retries WHERE workspace_id=? AND connection_id=? AND order_id=?', args: [workspaceId, Number(connectionId), String(payload.order?.id)] });
  await createFinanceRepository(db).captureResponsibilities(workspaceId, { connectionId, shipmentId });
}
