import { db } from '@/lib/db';
import { findIntegrationConnectionByStore } from '@/lib/integrationService';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { syncSingleMercadoLibreOrder } from '@/lib/mercadolibreStore';

export async function processMercadoLibreNotification(body) {
  const connection = await findIntegrationConnectionByStore({ provider: 'mercadolibre', externalStoreId: String(body.user_id || ''), includeConfig: true });
  if (!connection?.config?.accessToken) return { ignored: 'cuenta no conectada' };
  const targets = await listMercadoLibreClientTargets(connection.workspaceId, { connectionId: connection.id });
  const client = targets[0]?.client;
  if (!client) throw new Error('Cliente no disponible');
  let orderId = '';
  if (['orders', 'orders_v2'].includes(body.topic)) orderId = String(body.resource || '').match(/\/orders\/(\d+)/)?.[1] || '';
  else if (['shipments', 'flex-handshakes'].includes(body.topic)) {
    const shipmentId = String(body.resource || '').match(/\/shipments\/(\d+)/)?.[1];
    if (!shipmentId) return { ignored: 'sin shipment id' };
    const shipment = await client.getShipment(shipmentId);
    if (/^\d+$/.test(String(shipment.external_reference || ''))) orderId = String(shipment.external_reference);
    if (!orderId) {
      const stored = await db.execute({ sql: 'SELECT order_id FROM mercadolibre_orders WHERE workspace_id = ? AND integration_connection_id = ? AND shipment_id = ? LIMIT 1', args: [connection.workspaceId, connection.id, shipmentId] });
      orderId = stored.rows[0]?.order_id;
    }
    if (!orderId) throw new Error('Envío sin orden asociada; pendiente de sincronización');
  } else return { ignored: 'topic no utilizado' };
  if (!orderId) return { ignored: 'sin order id' };
  const full = await syncSingleMercadoLibreOrder({ workspaceId: connection.workspaceId, client, orderId, connectionId: connection.id, externalStoreId: connection.externalStoreId, siteId: connection.config.siteId || 'MLA' });
  if (!full?.shipment) throw new Error('No se pudo actualizar el envío');
  return { updated: Boolean(full?.order) };
}
export async function retryMercadoLibreNotifications() {
  const pending = await db.execute(`SELECT id, payload_json FROM mercadolibre_notifications WHERE processed_at IS NULL ORDER BY id DESC LIMIT 20`);
  let recovered = 0;
  for (const row of pending.rows) {
    try {
      await processMercadoLibreNotification(JSON.parse(row.payload_json));
      await db.execute({ sql: 'UPDATE mercadolibre_notifications SET processed_at = CURRENT_TIMESTAMP WHERE id = ?', args: [row.id] });
      recovered++;
    } catch (error) { console.error('ML notification retry:', row.id, error.message); }
  }
  return { attempted: pending.rows.length, recovered };
}
