import { financeRecord, filterRecords, summarize, groupRecords, parseJson, validDate, settlementCandidates, shipmentSales } from './logisticsFinance.js';
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
    // Append only: same-day versions cannot silently rewrite financial history.
    const inserted = await execute(`INSERT INTO carrier_rates(workspace_id,carrier_id,zone,valid_from,amount_cents,created_by) VALUES(?,?,?,?,?,?)`,
      [workspaceId, Number(input.carrierId), input.zone, input.validFrom, input.amountCents, actorId]);
    await captureResponsibilities(workspaceId);
    return inserted;
  }
  async function records(workspaceId, connection = db, identity = null) {
    const [rates, result, unlinked] = await Promise.all([
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
          'total_amount', json_extract(mo.raw_order_json, '$.total_amount')) ELSE NULL END AS raw_order_json,
        s.partido, s.assigned_carrier, c.id AS carrier_id, c.display_name AS carrier_display_name,
        f.costs_json, f.costs_synced_at, f.details_json, f.details_synced_at, f.sync_error, f.responsibility_json, f.pricing_json,
        si.settlement_id, si.snapshot_json AS locked_snapshot_json, si.amount_cents AS locked_amount_cents
        FROM mercadolibre_orders mo
        LEFT JOIN shipments s ON s.workspace_id = mo.workspace_id AND s.id = COALESCE(mo.shipment_row_id,
          (SELECT sx.id FROM shipments sx WHERE sx.workspace_id=mo.workspace_id AND sx.external_shipment_id=mo.shipment_id
            AND sx.integration_connection_id=mo.integration_connection_id ORDER BY sx.id DESC LIMIT 1))
        LEFT JOIN carriers c ON c.workspace_id = 0 AND (c.name = s.assigned_carrier OR CAST(c.id AS TEXT) = s.assigned_carrier)
        LEFT JOIN shipment_finance f ON f.workspace_id = mo.workspace_id AND f.connection_id = mo.integration_connection_id AND f.shipment_id = mo.shipment_id
        LEFT JOIN carrier_settlement_items si ON si.workspace_id = mo.workspace_id AND si.shipment_id = mo.shipment_id
        WHERE mo.workspace_id = ? AND mo.shipment_id IS NOT NULL AND mo.shipment_id <> ''
        ${identity ? 'AND mo.integration_connection_id = ? AND mo.shipment_id = ?' : ''}
        `, identity ? [workspaceId, identity.connectionId, identity.shipmentId] : [workspaceId], 'mo.id'),
      identity ? Promise.resolve({ rows: [] }) : readFinancePages(connection, `SELECT s.id, s.partido, s.assigned_carrier, s.recipient_name,
        s.shipping_method, c.id AS carrier_id, c.display_name AS carrier_display_name
        FROM shipments s LEFT JOIN carriers c ON c.workspace_id=0 AND (c.name=s.assigned_carrier OR CAST(c.id AS TEXT)=s.assigned_carrier)
        WHERE s.workspace_id=? AND s.shipping_method='flex' AND NOT EXISTS (
          SELECT 1 FROM mercadolibre_orders mo WHERE mo.workspace_id=s.workspace_id AND (mo.shipment_row_id=s.id OR (mo.shipment_id=s.external_shipment_id AND mo.shipment_id<>'')))`, [workspaceId], 's.id'),
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
    const local = unlinked.rows.map((row) => ({
      ...financeRecord({ ...row, shipment_id: `local:${row.id}`, shipment_status: '', order_id: '', integration_connection_id: null }, rates),
      missing: 'Sin confirmación de Mercado Libre', amountCents: null, connectionId: null, orderId: null,
      stateLabel: 'Sin confirmación de Mercado Libre',
      salesCents: null, salesMissingCount: 0, paidOrderCount: 0,
    }));
    return [...unique.values(), ...local].filter((r) => r.method !== 'other');
  }
  async function captureResponsibilities(workspaceId, identity = null) {
    const rows = await records(workspaceId, db, identity);
    const statements = rows.filter((r) => r.method === 'flex' && (!r.responsibility || !r.pricing && r.rateId) && r.dispatchDay && r.carrierId && r.zone).map((r) => ({
      sql: `INSERT INTO shipment_finance(workspace_id,connection_id,shipment_id,responsibility_json,pricing_json) VALUES(?,?,?,?,?)
        ON CONFLICT(workspace_id,connection_id,shipment_id) DO UPDATE SET
        responsibility_json = COALESCE(shipment_finance.responsibility_json,excluded.responsibility_json),
        pricing_json = COALESCE(shipment_finance.pricing_json,excluded.pricing_json)`,
      args: [workspaceId, r.connectionId, r.shipmentId, JSON.stringify({ carrierId: r.carrierId, carrierName: r.carrierName, partido: r.partido, zone: r.zone, dispatchDay: r.dispatchDay }),
        r.rateId && r.amountCents !== null ? JSON.stringify({ rateId: r.rateId, amountCents: r.amountCents }) : null],
    }));
    if (statements.length) await db.batch(statements, 'write');
  }
  async function report(workspaceId, filters) {
    const all = await records(workspaceId);
    const rows = filterRecords(all, filters);
    return { rows, summary: summarize(rows), byZone: groupRecords(rows, 'zone'), byPartido: groupRecords(rows, 'partido'),
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
  async function settlementDetail(workspaceId, id, connection = db) {
    const query = (sql, args) => connection.execute({ sql, args });
    const result = await query('SELECT * FROM carrier_settlements WHERE workspace_id = ? AND id = ?', [workspaceId, id]);
    const settlement = result.rows[0];
    if (!settlement) throw new Error('Liquidación no encontrada');
    const adjustments = (await query('SELECT * FROM carrier_settlement_adjustments WHERE workspace_id = ? AND settlement_id = ? ORDER BY id', [workspaceId, id])).rows;
    let items;
    if (settlement.status === 'draft') {
      items = settlementCandidates(await records(workspaceId, connection), settlement.carrier_id, settlement.date_from, settlement.date_to);
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
        if (s.status !== 'draft') throw new Error('Solo se pueden cerrar borradores');
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
  return { listRates, saveRate, records, captureResponsibilities, report, listSettlements, settlementDetail, createSettlement, mutateSettlement };
}
