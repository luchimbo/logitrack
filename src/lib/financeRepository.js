import { financeRecord, filterRecords, summarize, groupRecords, parseJson, validDate, settlementCandidates, shipmentSales, chooseRate, internalDispatchDay,
  localDay } from './logisticsFinance.js';
import { tiendanubeFinanceRecords } from './tiendanubeFinance.js';
import { ZONE_ORDER } from './zoneGroups.js';

// Bound each database response, without capping the history used by totals.
// Keyset pagination also works inside the settlement closing transaction.
async function readFinancePages(connection, sql, args, idColumn) {
  const rows = [];
  let before = null;
  let size = 100;
  while (true) {
    let result;
    try {
      result = await connection.execute({
        sql: `${sql} AND (? IS NULL OR ${idColumn} < ?) ORDER BY ${idColumn} DESC LIMIT ?`,
        args: [...args, before, before, size],
      });
    } catch (error) {
      if (size > 1 && /RESPONSE_TOO_LARGE|response is too large/i.test(`${error.code || ''} ${error.message || ''}`)) {
        size = Math.max(1, Math.floor(size / 2));
        continue;
      }
      throw error;
    }
    rows.push(...result.rows);
    if (result.rows.length < size) return { rows };
    before = result.rows[result.rows.length - 1].id;
  }
}

const LEAN_FIELDS = ['connectionId', 'shipmentId', 'orderId', 'method', 'partido', 'zone', 'carrierId', 'carrierName', 'dispatchDay', 'deliveryDay',
  'estimatedDay', 'state', 'stateLabel', 'delayed', 'overdue', 'incident', 'amountCents', 'missing', 'settlementId', 'salesCents', 'salesMissingCount',
  'paidOrderCount', 'paidKnownOrderCount', 'feesCents', 'feesMissingCount', 'netCents', 'stale', 'province', 'source', 'shippingCollectedCents', 'trackingNumber', 'sellerId', 'recipient'];
const SNAPSHOT_TTL_MS = 5 * 60_000;
// Bump when the calculation changes, so stored summaries are rebuilt on next read.
const SNAPSHOT_VERSION = 8;
const rebuilding = new Map();
// Flex amounts that come straight from the rate table are recomputed on read, so changing a rate never needs a rebuild.
function leanRecord(r) {
  const lean = Object.fromEntries(LEAN_FIELDS.map((key) => [key, r[key] ?? null]));
  if (r.method === 'flex' && !r.settlementId && !r.pricing && r.carrierId && r.zone && validDate(r.dispatchDay) && !['canceled', 'problem'].includes(r.state)) lean.dyn = true;
  return lean;
}
function applyRates(lean, rates) {
  if (!lean.dyn) return lean;
  const rate = chooseRate(rates, { carrierId: lean.carrierId, zone: lean.zone, dispatchDay: lean.dispatchDay });
  return { ...lean, amountCents: rate ? Number(rate.amount_cents) : null, missing: rate ? '' : 'Sin tarifa' };
}

export function createFinanceRepository(db) {
  const execute = (sql, args = []) => db.execute({ sql, args });
  async function listRates(workspaceId, connection = db) {
    return (await connection.execute({ sql: `SELECT r.*, c.display_name AS carrier_name FROM carrier_rates r
      LEFT JOIN carriers c ON c.id = r.carrier_id WHERE r.workspace_id = ? ORDER BY r.valid_from DESC, r.id DESC`, args: [workspaceId] })).rows;
  }
  async function saveRate(workspaceId, input, actorId) {
    if (!ZONE_ORDER.includes(input.zone) || !validDate(input.validFrom) || !Number.isSafeInteger(input.amountCents) || input.amountCents < 0) throw new Error('Zona, fecha o importe inválido');
    const carrier = await execute('SELECT id FROM carriers WHERE id = ?', [Number(input.carrierId)]);
    if (!carrier.rows.length) throw new Error('Transportista no encontrado');
    // Re-saving the same carrier, zone and date corrects that rate. Shipments already in a settlement keep their frozen amount.
    const existing = await execute('SELECT id FROM carrier_rates WHERE workspace_id = ? AND carrier_id = ? AND zone = ? AND valid_from = ?',
      [workspaceId, Number(input.carrierId), input.zone, input.validFrom]);
    const inserted = await execute(`INSERT INTO carrier_rates(workspace_id,carrier_id,zone,valid_from,amount_cents,created_by) VALUES(?,?,?,?,?,?)
      ON CONFLICT(workspace_id,carrier_id,zone,valid_from) DO UPDATE SET amount_cents = excluded.amount_cents, created_by = excluded.created_by`,
      [workspaceId, Number(input.carrierId), input.zone, input.validFrom, input.amountCents, actorId]);
    if (existing.rows.length) {
      await execute(`UPDATE shipment_finance SET pricing_json = NULL WHERE workspace_id = ? AND json_extract(pricing_json,'$.rateId') = ?
        AND NOT EXISTS (SELECT 1 FROM carrier_settlement_items i WHERE i.workspace_id = shipment_finance.workspace_id
          AND i.connection_id = shipment_finance.connection_id AND i.shipment_id = shipment_finance.shipment_id)`,
        [workspaceId, Number(existing.rows[0].id)]);
    }
    // Prices are frozen per shipment on the next sync; recomputing every record here made saving very slow.
    return inserted;
  }
  async function tiendanubeRecords(workspaceId, connection = db) {
    const result = await readFinancePages(connection, `SELECT id, integration_connection_id, external_store_id, tiendanube_id,
      status, payment_status, shipping_status, dispatch_status, dispatch_marked_at, dispatched_at_external,
      contact_name, shipping_address_json, total, currency, shipping_cost_customer, shipping_cost_owner, order_source, synced_at
      FROM tiendanube_orders WHERE workspace_id = ?`, [workspaceId], 'id');
    return tiendanubeFinanceRecords(result.rows);
  }
  async function records(workspaceId, connection = db, identity = null) {
    if (identity?.shipmentId?.startsWith('tn:')) return (await tiendanubeRecords(workspaceId, connection))
      .filter((r) => r.shipmentId === identity.shipmentId && Number(r.connectionId) === Number(identity.connectionId));
    const [rates, result, unlinked, custom, tiendanube] = await Promise.all([
      listRates(workspaceId, connection),
      readFinancePages(connection, `SELECT mo.id, mo.integration_connection_id, mo.shipment_id, mo.order_id,
        mo.user_id, mo.external_store_id, mo.logistic_type, mo.shipping_method, mo.shipment_status, mo.shipment_substatus,
        mo.status, mo.currency, mo.total, mo.raw_shipment_json, mo.lead_time_json, mo.history_json,
        mo.delays_json, mo.carrier_json, mo.address_json, mo.synced_at, mo.recipient_name,
        mo.label_printed_at, mo.label_imported_at,
        CASE WHEN json_valid(mo.raw_order_json) THEN json_object(
          'id', json_extract(mo.raw_order_json, '$.id'),
          'status', json_extract(mo.raw_order_json, '$.status'),
          'currency_id', json_extract(mo.raw_order_json, '$.currency_id'),
          'total_amount', json_extract(mo.raw_order_json, '$.total_amount'),
          'order_items', json(COALESCE((SELECT json_group_array(json_object('quantity', json_extract(it.value, '$.quantity'),
            'sale_fee', json_extract(it.value, '$.sale_fee'))) FROM json_each(mo.raw_order_json, '$.order_items') it), '[]'))) ELSE NULL END AS raw_order_json,
        s.partido, s.assigned_carrier, s.province AS internal_province, c.id AS carrier_id, c.display_name AS carrier_display_name,
        sb.date AS batch_date,
        f.costs_json, f.costs_synced_at, f.details_json, f.details_synced_at, f.sync_error, f.responsibility_json, f.pricing_json,
        si.settlement_id, si.snapshot_json AS locked_snapshot_json, si.amount_cents AS locked_amount_cents
        FROM mercadolibre_orders mo
        LEFT JOIN shipments s ON s.workspace_id = mo.workspace_id AND s.id = COALESCE(mo.shipment_row_id,
          (SELECT sx.id FROM shipments sx WHERE sx.workspace_id=mo.workspace_id AND sx.external_shipment_id=mo.shipment_id
            AND sx.integration_connection_id=mo.integration_connection_id ORDER BY sx.id DESC LIMIT 1),
          (SELECT st.id FROM shipments st WHERE st.workspace_id=mo.workspace_id AND st.tracking_number=mo.shipment_id ORDER BY st.id DESC LIMIT 1))
        LEFT JOIN daily_batches sb ON sb.id = s.batch_id AND sb.workspace_id = mo.workspace_id
        LEFT JOIN carriers c ON c.workspace_id = 0 AND (c.name = s.assigned_carrier OR CAST(c.id AS TEXT) = s.assigned_carrier)
        LEFT JOIN shipment_finance f ON f.workspace_id = mo.workspace_id AND f.connection_id = mo.integration_connection_id AND f.shipment_id = mo.shipment_id
        LEFT JOIN carrier_settlement_items si ON si.workspace_id = mo.workspace_id AND si.shipment_id = mo.shipment_id
        WHERE mo.workspace_id = ? AND mo.shipment_id IS NOT NULL AND mo.shipment_id <> ''
        ${identity ? 'AND mo.integration_connection_id = ? AND mo.shipment_id = ?' : ''}
        `, identity ? [workspaceId, identity.connectionId, identity.shipmentId] : [workspaceId], 'mo.id'),
      identity ? Promise.resolve({ rows: [] }) : readFinancePages(connection, `SELECT s.id, s.partido, s.assigned_carrier, s.recipient_name, s.province AS internal_province, s.tracking_number,
        s.shipping_method, s.dispatch_date, s.created_at, s.status AS internal_status, lb.date AS batch_date, c.id AS carrier_id, c.display_name AS carrier_display_name
        FROM shipments s LEFT JOIN daily_batches lb ON lb.id = s.batch_id AND lb.workspace_id = s.workspace_id
        LEFT JOIN carriers c ON c.workspace_id=0 AND (c.name=s.assigned_carrier OR CAST(c.id AS TEXT)=s.assigned_carrier)
        WHERE s.workspace_id=? AND s.shipping_method IN ('flex','colecta')
          AND NOT EXISTS (SELECT 1 FROM mercadolibre_orders mo WHERE mo.workspace_id=s.workspace_id AND mo.shipment_row_id=s.id)
          AND NOT EXISTS (SELECT 1 FROM mercadolibre_orders mo WHERE mo.workspace_id=s.workspace_id AND mo.shipment_id=s.external_shipment_id AND mo.shipment_id<>'')
          AND NOT EXISTS (SELECT 1 FROM mercadolibre_orders mo WHERE mo.workspace_id=s.workspace_id AND mo.shipment_id=s.tracking_number AND mo.shipment_id<>'')`, [workspaceId], 's.id'),
      // Paid Mercado Libre sales with shipping "a coordinar": no ML shipment exists for them.
      identity ? Promise.resolve({ rows: [] }) : readFinancePages(connection, `SELECT mo.id, mo.integration_connection_id, mo.order_id, mo.pack_id,
        mo.user_id, mo.external_store_id, mo.status, mo.currency, mo.total, mo.recipient_name, mo.buyer_nickname, mo.synced_at,
        json_extract(mo.raw_order_json, '$.date_created') AS order_created,
        TRIM(COALESCE(json_extract(mo.raw_order_json, '$.buyer.first_name'), '') || ' ' || COALESCE(json_extract(mo.raw_order_json, '$.buyer.last_name'), '')) AS buyer_name,
        CASE WHEN json_valid(mo.raw_order_json) THEN json_object(
          'id', json_extract(mo.raw_order_json, '$.id'),
          'status', json_extract(mo.raw_order_json, '$.status'),
          'currency_id', json_extract(mo.raw_order_json, '$.currency_id'),
          'total_amount', json_extract(mo.raw_order_json, '$.total_amount'),
          'order_items', json(COALESCE((SELECT json_group_array(json_object('quantity', json_extract(it.value, '$.quantity'),
            'sale_fee', json_extract(it.value, '$.sale_fee'))) FROM json_each(mo.raw_order_json, '$.order_items') it), '[]'))) ELSE NULL END AS raw_order_json
        FROM mercadolibre_orders mo WHERE mo.workspace_id = ? AND (mo.shipment_id IS NULL OR mo.shipment_id = '') AND mo.status = 'paid'`, [workspaceId], 'mo.id'),
      identity ? Promise.resolve([]) : tiendanubeRecords(workspaceId, connection),
    ]);
    // Preserve the newest-copy rule for orders repeated across connections,
    // even when the matching rows arrived in different database pages.
    result.rows.sort((a, b) => {
      const left = a.synced_at || '', right = b.synced_at || '';
      return left === right ? Number(b.id) - Number(a.id) : left < right ? 1 : -1;
    });
    const unique = new Map();
    const ordersByShipment = new Map();
    for (const row of result.rows) {
      const key = String(row.shipment_id);
      if (!unique.has(key)) unique.set(key, financeRecord(row, rates));
      if (!ordersByShipment.has(key)) ordersByShipment.set(key, []);
      ordersByShipment.get(key).push(row);
    }
    for (const [key, record] of unique) Object.assign(record, shipmentSales(ordersByShipment.get(key)));
    // Shipments imported from labels and never matched to a Mercado Libre order: dated and priced from the app's own data.
    const local = unlinked.rows.map((row) => {
      const record = financeRecord({ ...row, shipment_id: `local:${row.id}`, shipment_status: '', order_id: '', integration_connection_id: null,
        internal_dispatch_day: internalDispatchDay(row.dispatch_date, row.created_at) }, rates);
      return { ...record, connectionId: null, orderId: null, trackingNumber: row.tracking_number || '', stateLabel: 'Sin confirmación de Mercado Libre',
        salesCents: null, salesMissingCount: 0, paidOrderCount: 0 };
    });
    return [...unique.values(), ...local, ...shippingToArrange(custom.rows), ...tiendanube].filter((r) => r.method !== 'other');
  }
  // Mercado Libre a coordinar sales remain independent of Tiendanube checkout shipping.
  function shippingToArrange(customRows) {
    const byOrder = new Map();
    for (const row of [...customRows].sort((a, b) => String(b.synced_at || '').localeCompare(String(a.synced_at || '')))) {
      const key = String(row.pack_id || row.order_id);
      if (!byOrder.has(key)) byOrder.set(key, []);
      byOrder.get(key).push(row);
    }
    const sales = [...byOrder].map(([key, rows]) => {
      const first = rows[0];
      const orderDay = localDay(first.order_created || '');
      return { connectionId: Number(first.integration_connection_id), shipmentId: `order:${key}`, orderId: first.order_id, sellerId: first.user_id || first.external_store_id,
        recipient: first.buyer_name || first.recipient_name || '', method: 'colecta', source: 'ml_custom', partido: '', zone: '', province: '',
        carrierId: null, carrierName: 'A coordinar', dispatchDay: orderDay, deliveryDay: '', estimatedDay: '', state: 'pending', stateLabel: 'Envío a coordinar',
        delayed: false, overdue: false, incident: false, history: [], amountCents: null, missing: 'Sin costo de envío (a coordinar)', settlementId: null,
        stale: false, buyerName: first.buyer_name || '', ...shipmentSales(rows) };
    });
    return sales;
  }
  async function captureResponsibilities(workspaceId, identity = null) {
    const rows = await records(workspaceId, db, identity);
    const statements = rows.filter((r) => r.method === 'flex' && (!r.responsibility || !r.pricing && r.rateId) && r.connectionId && r.dispatchDay && r.carrierId && r.zone).map((r) => ({
      sql: `INSERT INTO shipment_finance(workspace_id,connection_id,shipment_id,responsibility_json,pricing_json) VALUES(?,?,?,?,?)
        ON CONFLICT(workspace_id,connection_id,shipment_id) DO UPDATE SET
        responsibility_json = COALESCE(shipment_finance.responsibility_json,excluded.responsibility_json),
        pricing_json = COALESCE(shipment_finance.pricing_json,excluded.pricing_json)`,
      args: [workspaceId, r.connectionId, r.shipmentId, JSON.stringify({ carrierId: r.carrierId, carrierName: r.carrierName, partido: r.partido, zone: r.zone, dispatchDay: r.dispatchDay }),
        r.rateId && r.amountCents !== null ? JSON.stringify({ rateId: r.rateId, amountCents: r.amountCents }) : null],
    }));
    if (statements.length) await db.batch(statements, 'write');
  }
  async function rebuildSnapshot(workspaceId) {
    if (rebuilding.has(workspaceId)) return rebuilding.get(workspaceId);
    const job = (async () => {
      const all = await records(workspaceId);
      const seen = new Set();
      const rows = all.map((r, index) => {
        let key = `${r.connectionId}:${r.shipmentId}`;
        if (seen.has(key)) key = `${key}#${index}`;
        seen.add(key);
        return [key, r.dispatchDay || '', JSON.stringify(leanRecord(r))];
      });
      const options = { version: SNAPSHOT_VERSION, parties: [...new Set(all.map((r) => r.partido).filter(Boolean))].sort(),
        connections: [...new Set(all.map((r) => r.connectionId).filter(Boolean))],
        unmatchedCount: all.filter((r) => !r.orderId).length, noDispatchCount: all.filter((r) => !r.dispatchDay).length };
      const statements = [{ sql: 'DELETE FROM finance_snapshot WHERE workspace_id = ?', args: [workspaceId] }];
      for (let i = 0; i < rows.length; i += 40) {
        const chunk = rows.slice(i, i + 40);
        statements.push({ sql: `INSERT INTO finance_snapshot(workspace_id,row_key,dispatch_day,data_json) VALUES ${chunk.map(() => '(?,?,?,?)').join(',')}`,
          args: chunk.flatMap(([key, day, json]) => [workspaceId, key, day, json]) });
      }
      statements.push({ sql: `INSERT INTO finance_snapshot_meta(workspace_id,built_at,options_json) VALUES(?,?,?)
        ON CONFLICT(workspace_id) DO UPDATE SET built_at=excluded.built_at, options_json=excluded.options_json`, args: [workspaceId, new Date().toISOString(), JSON.stringify(options)] });
      await db.batch(statements, 'write');
    })().finally(() => rebuilding.delete(workspaceId));
    rebuilding.set(workspaceId, job);
    return job;
  }
  // Reads the precomputed snapshot. A missing snapshot is built once; an old one is refreshed after the response.
  async function snapshotReport(workspaceId, filters, { refresh = false, scheduleRefresh = null, withTargets = false, withRows = false } = {}) {
    const readMeta = async () => (await execute('SELECT built_at, options_json FROM finance_snapshot_meta WHERE workspace_id = ?', [workspaceId])).rows[0];
    let meta = await readMeta();
    if (!meta || refresh || parseJson(meta.options_json, {}).version !== SNAPSHOT_VERSION) {
      await rebuildSnapshot(workspaceId);
      meta = await readMeta();
    } else if (Date.now() - Date.parse(meta.built_at) > (parseJson(meta.options_json, {}).version !== SNAPSHOT_VERSION ? 60_000 : SNAPSHOT_TTL_MS)) {
      // An old summary is still shown while the new one is built after the response. Only the request that
      // claims the refresh rebuilds it, so many open pages do not rebuild at once.
      const claimed = await execute('UPDATE finance_snapshot_meta SET built_at = ? WHERE workspace_id = ? AND built_at = ?', [new Date().toISOString(), workspaceId, meta.built_at]);
      const refreshJob = () => rebuildSnapshot(workspaceId).catch((error) => console.error('Finance snapshot refresh failed:', error.message));
      if (Number(claimed.rowsAffected)) { if (scheduleRefresh) scheduleRefresh(refreshJob); else refreshJob(); }
    }
    const byDispatch = filters.dateBasis !== 'delivery';
    const conditions = ['workspace_id = ?'], args = [workspaceId];
    if (byDispatch && filters.from) { conditions.push('dispatch_day >= ?'); args.push(filters.from); }
    if (byDispatch && filters.to) { conditions.push('dispatch_day <> \'\' AND dispatch_day <= ?'); args.push(filters.to); }
    const [rates, result, months] = await Promise.all([listRates(workspaceId), execute(`SELECT data_json FROM finance_snapshot WHERE ${conditions.join(' AND ')}`, args),
      execute(`SELECT substr(dispatch_day, 1, 7) AS month, COUNT(*) AS n FROM finance_snapshot WHERE workspace_id = ? AND dispatch_day <> '' GROUP BY month ORDER BY month DESC LIMIT 6`, [workspaceId])]);
    const rows = filterRecords(result.rows.map((row) => applyRates(JSON.parse(row.data_json), rates)), filters);
    let targets = {};
    if (withTargets) {
      const undated = await execute(`SELECT data_json FROM finance_snapshot WHERE workspace_id = ? AND dispatch_day = '' LIMIT 5000`, [workspaceId]);
      // Colecta shipments of the period still without Mercado Libre's cost go first: only the full detail brings it.
      const syncTargets = [...rows.filter((r) => r.method === 'colecta' && r.source === 'ml' && r.amountCents === null), ...undated.rows.map((row) => JSON.parse(row.data_json)), ...rows.filter((r) => r.stale)]
        .filter((r) => r.source !== 'tiendanube' && r.orderId && r.connectionId && !['canceled'].includes(r.state))
        .map((r) => ({ orderId: r.orderId, connectionId: r.connectionId }))
        .filter((r, i, list) => list.findIndex((o) => o.orderId === r.orderId && o.connectionId === r.connectionId) === i).slice(0, 5000);
      // Labels of the period never matched to a Mercado Libre order: their tracking number is the ML shipment id, which leads to the order.
      const labelTargets = [...new Set(rows.filter((r) => !r.orderId && r.trackingNumber && /^\d{8,}$/.test(r.trackingNumber)).map((r) => r.trackingNumber))].slice(0, 2000);
      targets = { syncTargets, labelTargets };
    }
    return { summary: summarize(rows), byZone: groupRecords(rows, 'zone'), byPartido: groupRecords(rows, 'partido'), byProvince: groupRecords(rows, 'province'),
      byCarrier: groupRecords(rows.filter((r) => r.method === 'flex'), 'carrierName'), options: JSON.parse(meta.options_json), snapshotAt: meta.built_at, ...targets, ...(withRows ? { rows: rows.sort((a, b) => String(b.dispatchDay || '').localeCompare(String(a.dispatchDay || ''))) } : {}), dispatchMonths: months.rows.map((row) => ({ month: row.month, count: Number(row.n) })) };
  }
  async function report(workspaceId, filters, { compact = false, withRows = false, refresh = false, scheduleRefresh = null, withTargets = false } = {}) {
    if (compact || withRows) {
      try { return await snapshotReport(workspaceId, filters, { refresh, scheduleRefresh, withTargets, withRows }); }
      catch (error) { console.error('Finance snapshot unavailable, using full calculation:', error.message); }
    }
    const all = await records(workspaceId);
    const rows = filterRecords(all, filters);
    return { ...(compact && !withRows ? {} : { rows }), summary: summarize(rows), byZone: groupRecords(rows, 'zone'), byPartido: groupRecords(rows, 'partido'), byProvince: groupRecords(rows, 'province'),
      byCarrier: groupRecords(rows.filter((r) => r.method === 'flex'), 'carrierName'), options: {
        parties: [...new Set(all.map((r) => r.partido).filter(Boolean))].sort(),
        connections: [...new Set(all.map((r) => r.connectionId).filter(Boolean))],
        unmatchedCount: all.filter((r) => !r.orderId).length,
        noDispatchCount: all.filter((r) => !r.dispatchDay).length,
      } };
  }
  async function listSettlements(workspaceId) {
    return (await execute(`SELECT l.*, c.display_name AS carrier_name,
      (SELECT COUNT(*) FROM carrier_settlement_items i WHERE i.settlement_id = l.id) AS shipment_count,
      COALESCE((SELECT SUM(a.amount_cents) FROM carrier_settlement_adjustments a WHERE a.settlement_id = l.id),0) AS adjustments_cents
      FROM carrier_settlements l LEFT JOIN carriers c ON c.id = l.carrier_id WHERE l.workspace_id = ? ORDER BY l.id DESC`, [workspaceId])).rows;
  }
  // Draft preview from the precomputed snapshot: reading every order again takes too long for an interactive request.
  async function snapshotCandidates(workspaceId, settlement) {
    const meta = (await execute('SELECT options_json FROM finance_snapshot_meta WHERE workspace_id = ?', [workspaceId])).rows[0];
    if (!meta) await rebuildSnapshot(workspaceId);
    const since = new Date(`${settlement.date_from}T12:00:00Z`); since.setUTCDate(since.getUTCDate() - 30);
    const [rates, result] = await Promise.all([listRates(workspaceId), execute(`SELECT data_json FROM finance_snapshot WHERE workspace_id = ? AND dispatch_day >= ? AND dispatch_day <= ?`,
      [workspaceId, since.toISOString().slice(0, 10), settlement.date_to])]);
    return settlementCandidates(result.rows.map((row) => applyRates(JSON.parse(row.data_json), rates)), settlement.carrier_id, settlement.date_from, settlement.date_to);
  }
  async function settlementDetail(workspaceId, id, connection = db, { fast = false } = {}) {
    const query = (sql, args) => connection.execute({ sql, args });
    const result = await query('SELECT l.*, c.display_name AS carrier_name FROM carrier_settlements l LEFT JOIN carriers c ON c.id = l.carrier_id WHERE l.workspace_id = ? AND l.id = ?', [workspaceId, id]);
    const settlement = result.rows[0];
    if (!settlement) throw new Error('Liquidación no encontrada');
    const adjustments = (await query('SELECT * FROM carrier_settlement_adjustments WHERE workspace_id = ? AND settlement_id = ? ORDER BY id', [workspaceId, id])).rows;
    let items;
    if (settlement.status === 'draft') {
      items = fast ? await snapshotCandidates(workspaceId, settlement) : settlementCandidates(await records(workspaceId, connection), settlement.carrier_id, settlement.date_from, settlement.date_to);
    } else {
      items = (await query('SELECT * FROM carrier_settlement_items WHERE workspace_id = ? AND settlement_id = ? ORDER BY id', [workspaceId, id])).rows
        .map((r) => ({ ...parseJson(r.snapshot_json), amountCents: Number(r.amount_cents) }));
    }
    return { settlement, items, adjustments, totalCents: items.reduce((n, i) => n + i.amountCents, 0) + adjustments.reduce((n, a) => n + Number(a.amount_cents), 0) };
  }
  async function createSettlement(workspaceId, input, actorId) {
    if (!validDate(input.from) || !validDate(input.to) || input.from > input.to) throw new Error('Período inválido');
    if (!(await execute('SELECT id FROM carriers WHERE id = ?', [Number(input.carrierId)])).rows.length) throw new Error('Transportista no encontrado');
    const inserted = await execute(`INSERT INTO carrier_settlements(workspace_id,carrier_id,date_from,date_to,created_by) VALUES(?,?,?,?,?)`, [workspaceId, Number(input.carrierId), input.from, input.to, actorId]);
    return Number(inserted.lastInsertRowid);
  }
  async function mutateSettlement(workspaceId, id, action, input, actorId) {
    const tx = await db.transaction('write');
    try {
      const detail = await settlementDetail(workspaceId, id, tx);
      const s = detail.settlement;
      if (action === 'close') {
        if (s.status !== 'draft') throw new Error('Esta liquidación ya está cerrada');
        if (!detail.items.length) throw new Error('No hay entregados con tarifa completa para liquidar');
        for (const item of detail.items) await tx.execute({
          sql: `INSERT INTO carrier_settlement_items(settlement_id,workspace_id,connection_id,shipment_id,amount_cents,snapshot_json) VALUES(?,?,?,?,?,?)`,
          args: [id, workspaceId, item.connectionId, item.shipmentId, item.amountCents, JSON.stringify(item)],
        });
        await tx.execute({ sql: "UPDATE carrier_settlements SET status='closed', total_cents=?, closed_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?", args: [detail.totalCents, id, workspaceId] });
      } else if (action === 'pay') {
        if (s.status !== 'closed' || !validDate(input.paidAt)) throw new Error('Se requiere una liquidación cerrada y fecha de pago válida');
        if (detail.totalCents < 0) throw new Error('El total a pagar no puede ser negativo');
        await tx.execute({ sql: "UPDATE carrier_settlements SET status='paid',paid_at=?,payment_reference=? WHERE id=? AND workspace_id=?", args: [input.paidAt, String(input.reference || '').slice(0, 500), id, workspaceId] });
      } else if (action === 'adjust') {
        if (s.status !== 'closed') throw new Error('Los ajustes requieren una liquidación cerrada y todavía no pagada');
        if (!Number.isSafeInteger(input.amountCents) || !String(input.reason || '').trim() || String(input.reason).length > 1000) throw new Error('Indicar importe y motivo del ajuste');
        await tx.execute({ sql: 'INSERT INTO carrier_settlement_adjustments(settlement_id,workspace_id,amount_cents,reason,created_by) VALUES(?,?,?,?,?)', args: [id, workspaceId, input.amountCents, input.reason.trim(), actorId] });
      } else throw new Error('Acción inválida');
      // Audit is in the same transaction as the financial change, including payment.
      await tx.execute({ sql: `INSERT INTO audit_logs(workspace_id,app_user_id,actor_type,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,?,?,?)`, args: [workspaceId, actorId, 'user', `settlement.${action}`, 'carrier_settlement', String(id), JSON.stringify(input)] });
      await tx.commit();
    } catch (error) { await tx.rollback(); throw error; } finally { tx.close(); }
  }
  return { listRates, saveRate, records, captureResponsibilities, rebuildSnapshot, report, listSettlements, settlementDetail, createSettlement, mutateSettlement };
}
