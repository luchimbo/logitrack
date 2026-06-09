import { randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';

export function normalizePrintQueueIds(ids) {
  return Array.isArray(ids)
    ? [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
    : [];
}

function generateQueueJobId() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const rand = randomBytes(4).toString('hex');
  return `pq-${stamp}-${rand}`;
}

export async function enqueuePrintQueue({ workspaceId, actorId = null, shipmentIds = [] } = {}) {
  await ensureDb();
  const normalizedIds = normalizePrintQueueIds(shipmentIds);

  if (!normalizedIds.length) {
    const error = new Error('No hay etiquetas seleccionadas');
    error.status = 400;
    throw error;
  }
  if (normalizedIds.length > 500) {
    const error = new Error('Maximo 500 etiquetas por job');
    error.status = 400;
    throw error;
  }

  const placeholders = normalizedIds.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `SELECT id, raw_zpl FROM shipments WHERE workspace_id = ? AND id IN (${placeholders})`,
    args: [workspaceId, ...normalizedIds],
  });

  const byId = new Map(result.rows.map((row) => [Number(row.id), row]));
  const missingIds = normalizedIds.filter((id) => !byId.has(id));
  if (missingIds.length) {
    const error = new Error('Algunas etiquetas no pertenecen a este workspace');
    error.status = 404;
    error.missingIds = missingIds;
    throw error;
  }

  const withoutZpl = normalizedIds.filter((id) => !String(byId.get(id)?.raw_zpl || '').trim());
  if (withoutZpl.length) {
    const error = new Error(`Hay ${withoutZpl.length} etiqueta(s) sin ZPL disponible`);
    error.status = 422;
    error.withoutZpl = withoutZpl;
    throw error;
  }

  const zpl = normalizedIds.map((id) => String(byId.get(id).raw_zpl).trim()).join('\r\n');
  const queueJobId = generateQueueJobId();

  await db.execute({
    sql: `INSERT INTO print_queue (workspace_id, queue_job_id, status, shipment_ids_json, zpl, labels_total, requested_by)
          VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
    args: [workspaceId, queueJobId, JSON.stringify(normalizedIds), zpl, normalizedIds.length, actorId],
  });

  return {
    queue_job_id: queueJobId,
    labels_total: normalizedIds.length,
    shipment_ids: normalizedIds,
  };
}
