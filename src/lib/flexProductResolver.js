import { db } from '@/lib/db';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { syncMercadoLibreOrders } from '@/lib/mercadolibreStore';
import { isGenericFlexProductName, resolveFlexProductsFromOrderRows } from '@/lib/flexProductMetadata';

export { isGenericFlexProductName, resolveFlexProductsFromOrderRows } from '@/lib/flexProductMetadata';

export async function resolveGenericFlexProducts({ workspaceId, shipments, syncRecent = true, maxPages = 5 } = {}) {
  const candidates = (shipments || []).filter((shipment) => isGenericFlexProductName(shipment.product_name) && shipment.tracking_number);
  if (!candidates.length) return { resolved: new Map(), unresolved: [], syncErrors: [] };

  const syncErrors = [];
  if (syncRecent) {
    const targets = await listMercadoLibreClientTargets(workspaceId);
    const outcomes = await Promise.allSettled(targets.map((target) => syncMercadoLibreOrders({
      workspaceId,
      client: target.client,
      connectionId: target.connectionId,
      externalStoreId: target.externalStoreId,
      siteId: target.config?.siteId || 'MLA',
      light: true,
      maxPages,
    })));
    outcomes.forEach((outcome, index) => {
      if (outcome.status === 'rejected') syncErrors.push(`${targets[index].externalStoreId}: ${outcome.reason?.message || 'error de sincronización'}`);
    });
  }

  const trackings = [...new Set(candidates.map((shipment) => String(shipment.tracking_number).trim()))];
  const result = await db.execute({
    sql: `SELECT shipment_id, tracking_number, products_json
          FROM mercadolibre_orders
          WHERE workspace_id = ? AND tracking_number IN (${trackings.map(() => '?').join(', ')})`,
    args: [workspaceId, ...trackings],
  });
  return { ...resolveFlexProductsFromOrderRows(candidates, result.rows || []), syncErrors };
}
