import { db } from "@/lib/db";

const SQL_ID_CHUNK_SIZE = 400;

function chunkIds(ids) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += SQL_ID_CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + SQL_ID_CHUNK_SIZE));
  }
  return chunks;
}

export function normalizeShipmentIds(ids) {
  return [...new Set(
    (Array.isArray(ids) ? ids : [ids])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];
}

async function refreshBatchTotals(workspaceId, batchIds) {
  const uniqueBatchIds = [...new Set(
    (batchIds || [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];

  for (const batchId of uniqueBatchIds) {
    await db.execute({
      sql: `UPDATE daily_batches
        SET total_packages = (
          SELECT COUNT(*) FROM shipments WHERE workspace_id = ? AND batch_id = ?
        )
        WHERE id = ? AND workspace_id = ?`,
      args: [workspaceId, batchId, batchId, workspaceId],
    });
  }
}

async function clearExternalShipmentLinks(workspaceId, shipmentIds) {
  if (!shipmentIds.length) return;

  for (const idsChunk of chunkIds(shipmentIds)) {
    const placeholders = idsChunk.map(() => "?").join(", ");
    await db.execute({
      sql: `UPDATE mercadolibre_orders
        SET label_imported_at = NULL, shipment_row_id = NULL
        WHERE workspace_id = ? AND shipment_row_id IN (${placeholders})`,
      args: [workspaceId, ...idsChunk],
    });
  }
}

export async function deleteShipmentsByIds({ workspaceId, ids }) {
  const normalizedIds = normalizeShipmentIds(ids);
  if (!normalizedIds.length) {
    return { ids: [], batchIds: [], deleted: 0 };
  }

  const rows = [];
  for (const idsChunk of chunkIds(normalizedIds)) {
    const placeholders = idsChunk.map(() => "?").join(", ");
    const existing = await db.execute({
      sql: `SELECT id, batch_id FROM shipments WHERE workspace_id = ? AND id IN (${placeholders})`,
      args: [workspaceId, ...idsChunk],
    });
    rows.push(...(existing.rows || []));
  }

  const existingIds = rows.map((row) => Number(row.id));
  const batchIds = rows.map((row) => row.batch_id);

  if (!existingIds.length) {
    return { ids: [], batchIds: [], deleted: 0 };
  }

  for (const idsChunk of chunkIds(existingIds)) {
    const deletePlaceholders = idsChunk.map(() => "?").join(", ");
    await db.execute({
      sql: `DELETE FROM shipments WHERE workspace_id = ? AND id IN (${deletePlaceholders})`,
      args: [workspaceId, ...idsChunk],
    });
  }

  await clearExternalShipmentLinks(workspaceId, existingIds);
  await refreshBatchTotals(workspaceId, batchIds);

  return { ids: existingIds, batchIds, deleted: existingIds.length };
}
