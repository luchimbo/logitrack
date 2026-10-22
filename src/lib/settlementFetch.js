// Background search of a settlement's period in Mercado Libre: orders of the window, then the carrier's labels
// still without a sale, then a fresh finance snapshot. Runs in short steps; each poll of an open app advances it.
import { db } from '@/lib/db';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { syncMercadoLibreOrdersPage, syncSingleMercadoLibreOrder } from '@/lib/mercadolibreStore';

const STEP_BUDGET_MS = 200_000;
const LEASE_MS = 270_000;
const execute = (sql, args = []) => db.execute({ sql, args });
const shift = (day, days) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const parse = (text, fallback) => { try { return JSON.parse(text || ''); } catch { return fallback; } };

export async function startSettlementFetch(workspaceId, settlementId) {
  await execute(`INSERT INTO settlement_fetch_jobs(settlement_id, workspace_id, status, phase, cursor_json, progress_json, error, lease_until, updated_at)
    VALUES(?,?,'running','orders','{}','{}',NULL,NULL,CURRENT_TIMESTAMP)
    ON CONFLICT(settlement_id) DO UPDATE SET status='running', phase='orders', cursor_json='{}', progress_json='{}', error=NULL, lease_until=NULL,
      notified_at=NULL, finished_at=NULL, updated_at=CURRENT_TIMESTAMP`, [settlementId, workspaceId]);
}

export async function listSettlementFetchJobs(workspaceId) {
  return (await execute(`SELECT j.settlement_id, j.status, j.phase, j.progress_json, j.error, j.finished_at, j.notified_at, j.lease_until,
    c.display_name AS carrier_name, l.date_from, l.date_to
    FROM settlement_fetch_jobs j JOIN carrier_settlements l ON l.id = j.settlement_id LEFT JOIN carriers c ON c.id = l.carrier_id
    WHERE j.workspace_id = ? AND (j.status <> 'done' OR j.notified_at IS NULL) ORDER BY j.settlement_id`, [workspaceId])).rows
    .map((j) => ({ settlementId: Number(j.settlement_id), status: j.status, phase: j.phase, progress: parse(j.progress_json, {}), error: j.error,
      carrierName: j.carrier_name, dateFrom: j.date_from, dateTo: j.date_to, finishedAt: j.finished_at, notified: Boolean(j.notified_at), leaseUntil: j.lease_until }));
}

export async function markSettlementFetchNotified(workspaceId, settlementIds) {
  for (const id of settlementIds) await execute("UPDATE settlement_fetch_jobs SET notified_at=CURRENT_TIMESTAMP WHERE workspace_id=? AND settlement_id=? AND status<>'running'", [workspaceId, Number(id)]);
}

// Claims one running job whose lease is free. Only the claiming request works on it.
export async function claimSettlementFetch(workspaceId) {
  const now = new Date();
  const candidate = (await execute(`SELECT settlement_id, lease_until FROM settlement_fetch_jobs WHERE workspace_id=? AND status='running'
    AND (lease_until IS NULL OR lease_until < ?) ORDER BY settlement_id LIMIT 1`, [workspaceId, now.toISOString()])).rows[0];
  if (!candidate) return null;
  const claimed = await execute(`UPDATE settlement_fetch_jobs SET lease_until=? WHERE settlement_id=? AND status='running' AND (lease_until IS ? OR lease_until = ?)`,
    [new Date(now.getTime() + LEASE_MS).toISOString(), candidate.settlement_id, candidate.lease_until, candidate.lease_until]);
  return Number(claimed.rowsAffected) ? Number(candidate.settlement_id) : null;
}

export async function runSettlementFetchStep(workspaceId, settlementId, { rebuildSnapshot, deps = {} } = {}) {
  const listTargets = deps.listTargets || listMercadoLibreClientTargets;
  const syncOrdersPage = deps.syncOrdersPage || syncMercadoLibreOrdersPage;
  const syncOrder = deps.syncOrder || syncSingleMercadoLibreOrder;
  const started = Date.now();
  const job = (await execute(`SELECT j.*, l.carrier_id, l.date_from, l.date_to, c.name AS carrier_key, c.display_name AS carrier_name
    FROM settlement_fetch_jobs j JOIN carrier_settlements l ON l.id = j.settlement_id LEFT JOIN carriers c ON c.id = l.carrier_id
    WHERE j.settlement_id=? AND j.workspace_id=?`, [settlementId, workspaceId])).rows[0];
  if (!job || job.status !== 'running') return null;
  let phase = job.phase;
  const cursor = parse(job.cursor_json, {});
  const progress = parse(job.progress_json, {});
  const save = (patch = {}) => execute(`UPDATE settlement_fetch_jobs SET phase=?, cursor_json=?, progress_json=?, updated_at=CURRENT_TIMESTAMP${patch.done ? ", status='done', finished_at=CURRENT_TIMESTAMP, lease_until=NULL" : ''} WHERE settlement_id=?`,
    [phase, JSON.stringify(cursor), JSON.stringify(progress), settlementId]);
  const inBudget = () => Date.now() - started < STEP_BUDGET_MS;
  try {
    const accounts = (await listTargets(workspaceId)).filter((t) => t.client);
    if (!accounts.length) throw new Error('No hay cuentas de Mercado Libre conectadas o su acceso venció.');
    // Flex packages are sold up to ~10 days before delivery and delivered within a day of dispatch.
    const dateFrom = `${shift(job.date_from, -10)}T00:00:00.000-03:00`, dateTo = `${shift(job.date_to, 1)}T23:59:59.999-03:00`;
    if (phase === 'orders') {
      cursor.account ??= 0; cursor.offset ??= 0; progress.orders ??= 0;
      while (cursor.account < accounts.length && inBudget()) {
        const account = accounts[cursor.account];
        const page = await syncOrdersPage({ workspaceId, client: account.client, connectionId: account.connectionId, externalStoreId: account.externalStoreId,
          siteId: account.config?.siteId || 'MLA', offset: cursor.offset, dateFrom, dateTo });
        progress.orders += page.synced;
        progress.ordersTotals ||= {};
        if (page.total !== null) progress.ordersTotals[account.connectionId] = page.total;
        progress.ordersTotal = Object.values(progress.ordersTotals).reduce((n, v) => n + (Number(v) || 0), 0);
        cursor.offset = page.nextOffset;
        if (page.done || (page.total !== null && cursor.offset >= page.total) || cursor.offset >= 10000) { cursor.account++; cursor.offset = 0; }
        await save();
      }
      if (cursor.account >= accounts.length) { phase = 'labels'; cursor.index = 0; await save(); }
    }
    if (phase === 'labels' && inBudget()) {
      // Labels of this carrier in the period that no Mercado Libre order matches yet: their tracking is the ML shipment id.
      const labels = (await execute(`SELECT DISTINCT s.tracking_number FROM shipments s LEFT JOIN daily_batches b ON b.id = s.batch_id AND b.workspace_id = s.workspace_id
        WHERE s.workspace_id=? AND s.shipping_method='flex' AND (s.assigned_carrier = ? OR s.assigned_carrier = ?)
          AND COALESCE(b.date, substr(s.created_at, 1, 10)) BETWEEN ? AND ?
          AND NOT EXISTS (SELECT 1 FROM mercadolibre_orders mo WHERE mo.workspace_id=s.workspace_id AND mo.shipment_row_id=s.id)
          AND NOT EXISTS (SELECT 1 FROM mercadolibre_orders mo WHERE mo.workspace_id=s.workspace_id AND mo.shipment_id=s.external_shipment_id AND mo.shipment_id<>'')
          AND NOT EXISTS (SELECT 1 FROM mercadolibre_orders mo WHERE mo.workspace_id=s.workspace_id AND mo.shipment_id=s.tracking_number AND mo.shipment_id<>'')
        ORDER BY s.tracking_number`, [workspaceId, String(job.carrier_key || ''), String(job.carrier_id), shift(job.date_from, -3), job.date_to])).rows
        .map((r) => String(r.tracking_number || '')).filter((t) => /^\d{8,}$/.test(t));
      progress.labelsTotal = (cursor.index || 0) + labels.length; progress.labels ??= 0; progress.labelsFound ??= 0;
      // Labels found are no longer listed, so the list itself is the cursor; misses are remembered to skip them.
      const skip = new Set(cursor.misses || []);
      for (const tracking of labels) {
        if (!inBudget()) break;
        if (skip.has(tracking)) continue;
        let found = null;
        for (const account of accounts) {
          try {
            const items = await account.client.getShipmentItems(tracking);
            const orderId = (Array.isArray(items) ? items : items?.results || [])[0]?.order_id;
            if (orderId) { found = { account, orderId }; break; }
          } catch { /* Shipment of another account, or not found. */ }
        }
        if (found) {
          try {
            await syncOrder({ workspaceId, client: found.account.client, orderId: found.orderId, connectionId: found.account.connectionId,
              externalStoreId: found.account.externalStoreId, siteId: found.account.config?.siteId || 'MLA' });
            progress.labelsFound++;
          } catch { skip.add(tracking); }
        } else skip.add(tracking);
        progress.labels++; cursor.misses = [...skip];
        if (progress.labels % 10 === 0) await save();
      }
      if (labels.every((t) => skip.has(t))) { phase = 'details'; cursor.misses = []; }
      await save();
    }
    if (phase === 'details' && inBudget()) {
      // The light order sync has no delivery date: delivered packages of this carrier without history get the full detail.
      const pending = (await execute(`SELECT DISTINCT mo.order_id, mo.integration_connection_id FROM mercadolibre_orders mo
        JOIN shipments s ON s.workspace_id = mo.workspace_id AND (s.id = mo.shipment_row_id OR (s.tracking_number = mo.shipment_id AND mo.shipment_id <> ''))
        LEFT JOIN daily_batches b ON b.id = s.batch_id AND b.workspace_id = s.workspace_id
        WHERE mo.workspace_id=? AND s.shipping_method='flex' AND (s.assigned_carrier = ? OR s.assigned_carrier = ?)
          AND COALESCE(b.date, substr(s.created_at, 1, 10)) BETWEEN ? AND ? AND mo.shipment_status = 'delivered'
          AND (mo.history_json IS NULL OR mo.history_json IN ('', '[]', 'null'))
        ORDER BY mo.order_id`, [workspaceId, String(job.carrier_key || ''), String(job.carrier_id), shift(job.date_from, -10), job.date_to])).rows;
      const skip = new Set(cursor.misses || []);
      const todo = pending.filter((r) => !skip.has(String(r.order_id)));
      progress.detailsTotal = (progress.details || 0) + todo.length; progress.details ??= 0;
      for (let i = 0; i < todo.length && inBudget(); i += 5) {
        await Promise.all(todo.slice(i, i + 5).map(async (row) => {
          const account = accounts.find((a) => Number(a.connectionId) === Number(row.integration_connection_id));
          try {
            if (!account) throw new Error('Cuenta no disponible');
            const full = await syncOrder({ workspaceId, client: account.client, orderId: row.order_id, connectionId: account.connectionId,
              externalStoreId: account.externalStoreId, siteId: account.config?.siteId || 'MLA' });
            // A detail without history would be listed again: remember it.
            if (!full?.history) skip.add(String(row.order_id));
          } catch { skip.add(String(row.order_id)); }
          progress.details++;
        }));
        cursor.misses = [...skip];
        await save();
      }
      if (todo.every((r) => skip.has(String(r.order_id))) || !todo.length) phase = 'snapshot';
      await save();
    }
    if (phase === 'snapshot' && inBudget()) {
      if (rebuildSnapshot) await rebuildSnapshot(workspaceId);
      await save({ done: true });
      return 'done';
    }
    await execute('UPDATE settlement_fetch_jobs SET lease_until=NULL WHERE settlement_id=?', [settlementId]);
    return phase;
  } catch (error) {
    await execute("UPDATE settlement_fetch_jobs SET status='error', error=?, lease_until=NULL, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE settlement_id=?",
      [String(error.message || error).slice(0, 500), settlementId]);
    return 'error';
  }
}
