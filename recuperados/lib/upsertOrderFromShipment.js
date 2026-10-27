import { db } from "@/lib/db";

function toDbValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "bigint") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function getManualOrderKey(shipment) {
  return shipment.sale_id || shipment.tracking_number || null;
}

export async function upsertOrderFromShipment({ workspaceId, shipmentId, shipment }) {
  const externalOrderId = getManualOrderKey(shipment);
  if (!workspaceId || !shipmentId || !externalOrderId) return null;

  const sourceProvider = shipment.external_provider || "manual_label";
  const existing = await db.execute({
    sql: `SELECT id FROM orders
      WHERE workspace_id = ? AND source_provider = ? AND external_order_id = ?
      LIMIT 1`,
    args: [workspaceId, sourceProvider, externalOrderId],
  });

  let orderId = existing.rows.length ? Number(existing.rows[0].id) : null;

  if (orderId) {
    await db.execute({
      sql: `UPDATE orders SET
        customer_name = COALESCE(?, customer_name),
        shipping_method = COALESCE(?, shipping_method),
        shipping_carrier = COALESCE(?, shipping_carrier),
        address = COALESCE(?, address),
        city = COALESCE(?, city),
        province = COALESCE(?, province),
        postal_code = COALESCE(?, postal_code),
        updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND workspace_id = ?`,
      args: [
        toDbValue(shipment.recipient_name),
        toDbValue(shipment.shipping_method),
        toDbValue(shipment.assigned_carrier || shipment.carrier_name),
        toDbValue(shipment.address),
        toDbValue(shipment.city),
        toDbValue(shipment.province),
        toDbValue(shipment.postal_code),
        orderId,
        workspaceId,
      ],
    });
  } else {
    const inserted = await db.execute({
      sql: `INSERT INTO orders (
        workspace_id, operation_status, source_provider, external_order_id, order_number,
        customer_name, shipping_method, shipping_carrier, address, city, province, postal_code
      ) VALUES (?, 'ready_to_pick', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        workspaceId,
        sourceProvider,
        toDbValue(externalOrderId),
        toDbValue(shipment.sale_id || shipment.tracking_number),
        toDbValue(shipment.recipient_name),
        toDbValue(shipment.shipping_method),
        toDbValue(shipment.assigned_carrier || shipment.carrier_name),
        toDbValue(shipment.address),
        toDbValue(shipment.city),
        toDbValue(shipment.province),
        toDbValue(shipment.postal_code),
      ],
    });
    orderId = Number(inserted.lastInsertRowid);
  }

  await db.execute({
    sql: `INSERT OR IGNORE INTO order_shipments (workspace_id, order_id, shipment_id)
      VALUES (?, ?, ?)`,
    args: [workspaceId, orderId, shipmentId],
  });

  await db.execute({
    sql: `INSERT INTO order_items (workspace_id, order_id, sku, product_name, quantity, color, voltage)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      workspaceId,
      orderId,
      toDbValue(shipment.sku),
      toDbValue(shipment.product_name || "Producto sin nombre"),
      toDbValue(shipment.quantity ?? 1),
      toDbValue(shipment.color),
      toDbValue(shipment.voltage),
    ],
  });

  await db.execute({
    sql: "UPDATE shipments SET operation_status = 'ready_to_pick' WHERE id = ? AND workspace_id = ? AND operation_status IS NULL",
    args: [shipmentId, workspaceId],
  });

  return orderId;
}
