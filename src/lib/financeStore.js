import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { applicableRate, packageFromOrder, sellerShippingCost, buildFinanceReport } from './shippingFinance.js';

export async function listFinanceOrders(workspaceId) {
  return (await db.execute({
    sql: `SELECT mo.*, s.assigned_carrier AS local_carrier, s.partido AS local_partido, s.province AS local_province
          FROM mercadolibre_orders mo LEFT JOIN shipments s
          ON s.id = mo.shipment_row_id AND s.workspace_id = mo.workspace_id
          WHERE mo.workspace_id = ? ORDER BY mo.id`, args: [workspaceId],
  })).rows;
}
export async function listRates(workspaceId) {
  return (await db.execute({ sql: 'SELECT * FROM carrier_rates WHERE workspace_id = ? ORDER BY effective_from DESC, carrier_name, zone', args: [workspaceId] })).rows;
}
export async function recordFlexCharges(workspaceId, orders, rates) {
  const statements = [];
  const seen = new Set();
  for (const row of orders) {
    const p = packageFromOrder(row);
    if (p.modality !== 'flex' || p.status !== 'delivered' || !p.shipmentId || seen.has(p.key)) continue;
    seen.add(p.key);
    const rate = applicableRate(rates, p.carrier, p.zone, p.deliveryDate);
    if (!rate) continue;
    statements.push({ sql: `INSERT OR IGNORE INTO flex_delivery_charges
      (workspace_id, package_key, carrier_name, zone, delivery_date, rate_id, amount_cents) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [workspaceId, p.key, p.carrier, p.zone, p.deliveryDate, rate.id, rate.amount_cents] });
  }
  // Small batches also work against the remote libSQL service.
  for (let i = 0; i < statements.length; i += 100) await db.batch(statements.slice(i, i + 100), 'write');
}
export async function captureFinancialShipment({ workspaceId, connectionId, order, shipment, costs }) {
  if (!connectionId || !shipment?.id) return;
  if (costs) await db.execute({
    sql: `INSERT INTO ml_shipping_costs (workspace_id, connection_id, shipment_id, amount_cents, raw_json)
          VALUES (?, ?, ?, ?, ?) ON CONFLICT(workspace_id, connection_id, shipment_id)
          DO UPDATE SET amount_cents = excluded.amount_cents, raw_json = excluded.raw_json, synced_at = CURRENT_TIMESTAMP`,
    args: [workspaceId, connectionId, String(shipment.id), sellerShippingCost(costs, order?.seller?.id || shipment.sender_id), JSON.stringify(costs)],
  });
  if (shipment.status === 'delivered' && shipment.logistic?.type === 'self_service') {
    const [orders, rates] = await Promise.all([listFinanceOrders(workspaceId), listRates(workspaceId)]);
    await recordFlexCharges(workspaceId, orders.filter(r => String(r.shipment_id) === String(shipment.id)), rates);
  }
}
export async function financeReport(workspaceId, filters) {
  await ensureDb();
  const [orders, rates] = await Promise.all([listFinanceOrders(workspaceId), listRates(workspaceId)]);
  await recordFlexCharges(workspaceId, orders, rates);
  const [charges, costs, connections] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM flex_delivery_charges WHERE workspace_id = ?', args: [workspaceId] }),
    db.execute({ sql: 'SELECT connection_id, shipment_id, amount_cents, synced_at FROM ml_shipping_costs WHERE workspace_id = ?', args: [workspaceId] }),
    db.execute({ sql: "SELECT id, display_name, external_store_id FROM workspace_integration_connections WHERE workspace_id = ? AND provider = 'mercadolibre'", args: [workspaceId] }),
  ]);
  return { ...buildFinanceReport({ orders, rates, charges: charges.rows, costs: costs.rows, filters }), connections: connections.rows };
}
