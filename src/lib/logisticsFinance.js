import { zoneForPartido } from './zoneGroups.js';
import { getArgentinaDateString } from './dateUtils.js';
import { resolvePartidoFromGeo } from './zplParser.js';

export function parseJson(value, fallback = {}) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}
export const STATE_LABELS = {
  pending: 'Pendiente de despacho', in_transit: 'En tránsito', out_for_delivery: 'En reparto',
  delivered: 'Entregado', attempt: 'Intento fallido', canceled: 'Cancelado', problem: 'Con incidencia',
};
const EVENT_LABELS = { ...STATE_LABELS, shipped:'En tránsito', ready_to_ship:'Listo para despachar',
  handling:'En preparación', cancelled:'Cancelado', not_delivered:'No entregado', lost:'Extraviado',
  picked_up:'Retirado por transportista', in_hub:'En centro de distribución', deliver_attempt:'Intento de entrega',
  receiver_absent:'Comprador ausente', bad_address:'Dirección incorrecta', buyer_rescheduled:'Reprogramado por comprador',
  ready_to_pickup:'Listo para retirar', waiting_for_pickup:'Esperando retiro', ready_to_print:'Etiqueta disponible',
  printed:'Etiqueta impresa', ready_for_pickup:'Listo para retirar', me2_picked_up:'Retirado por transportista',
  me2_in_transit:'En tránsito', delayed:'Demorado', delivery_delayed:'Entrega demorada' };
export function deliveryEventLabel(event) {
  return EVENT_LABELS[event.substatus] || EVENT_LABELS[event.status] || event.substatus || event.status || 'Actualización';
}
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function toCents(value) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return null;
  const result = Math.round(Number(value) * 100);
  return Number.isSafeInteger(result) ? result : null;
}
// Gross paid order value, not a fiscal invoice or seller net proceeds.
export function orderSales(row) {
  const raw = parseJson(row.raw_order_json);
  const status = row.status || raw.status;
  if (['cancelled', 'canceled', 'invalid'].includes(status)) return { salesCents: 0, salesMissing: '', paidOrderCount: 0 };
  if (status !== 'paid') return { salesCents: null, salesMissing: status ? 'Venta no pagada' : 'Estado de venta no disponible', paidOrderCount: 0 };
  if ((row.currency || raw.currency_id) !== 'ARS') return { salesCents: null, salesMissing: 'Venta sin moneda ARS', paidOrderCount: 1 };
  const amount = toCents(raw.total_amount ?? row.total);
  return { salesCents: amount !== null && amount >= 0 ? amount : null,
    salesMissing: amount !== null && amount >= 0 ? '' : 'Importe de venta no disponible', paidOrderCount: 1 };
}
export function shipmentSales(rows) {
  const seen = new Set();
  let salesCents = 0, salesKnownCount = 0, salesMissingCount = 0, paidOrderCount = 0, paidKnownOrderCount = 0;
  for (const row of rows) {
    // Rows arrive newest first. The same ML order may be connected more than once.
    const raw = parseJson(row.raw_order_json);
    const key = String(row.order_id || raw.id || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const sale = orderSales(row);
    paidOrderCount += sale.paidOrderCount;
    if (sale.salesCents === null) salesMissingCount++;
    else { salesCents += sale.salesCents; salesKnownCount++; paidKnownOrderCount += sale.paidOrderCount; }
  }
  return { salesCents: salesKnownCount ? salesCents : null, salesKnownCount, salesMissingCount, paidOrderCount, paidKnownOrderCount };
}
export function sellerCost(costs, sellerId) {
  const sender = costs?.senders?.find((entry) => String(entry.user_id) === String(sellerId));
  return sender ? toCents(sender.cost) : null;
}
export function localDay(value) {
  if (!value) return '';
  if (validDate(value)) return value;
  // SQL timestamps are UTC. ML timestamps already carry an offset.
  return getArgentinaDateString(/^\d{4}-\d{2}-\d{2} \d{2}:/.test(value) ? `${value.replace(' ', 'T')}Z` : value);
}
function eventTime(history, statuses, subs = []) {
  const times = history.filter((e) => statuses.includes(e.status) || subs.includes(e.substatus))
    .map((e) => e.date || e.created_at).filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b));
  return times[0] || '';
}
function activeDelay(delays, substatus) {
  if (String(substatus).includes('delayed')) return true;
  const list = Array.isArray(delays) ? delays : delays?.delay || delays?.delays || [];
  return Array.isArray(list) && list.some((d) => !d.date_delayed_end && !d.date_end && !d.resolved_at && d.status !== 'resolved');
}
export function deliveryFacts(row, now = new Date()) {
  const details = parseJson(row.details_json);
  const currentShipment = parseJson(row.raw_shipment_json, null);
  const raw = currentShipment || details.shipment || {};
  const lead = details.leadTime ?? parseJson(row.lead_time_json);
  const historyData = details.history ?? parseJson(row.history_json, []);
  const history = (Array.isArray(historyData) ? historyData : historyData?.history || []).map((e) => ({
    status: e.status || '', substatus: e.substatus || '', date: e.date || e.created_at || '',
  })).sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
  // The lightweight shipment refresh is newer than detail endpoints in some syncs.
  const status = row.shipment_status || raw.status || '';
  const substatus = row.shipment_substatus || raw.substatus || '';
  let state = 'pending';
  if (['cancelled', 'canceled'].includes(status)) state = 'canceled';
  else if (status === 'delivered') state = 'delivered';
  else if (['not_delivered', 'lost'].includes(status)) state = 'problem';
  else if (['deliver_attempt', 'receiver_absent', 'bad_address'].includes(substatus)) state = 'attempt';
  else if (substatus === 'out_for_delivery') state = 'out_for_delivery';
  else if (['shipped', 'in_transit'].includes(status) || ['picked_up', 'in_hub', 'in_transit', 'me2_in_transit', 'me2_picked_up'].includes(substatus)) state = 'in_transit';
  const deliveredAt = raw.status_history?.date_delivered || eventTime(history, ['delivered']);
  const dispatchedAt = raw.status_history?.date_shipped || eventTime(history, ['shipped', 'in_transit'], ['picked_up', 'me2_picked_up']);
  const estimate = lead.estimated_delivery_time || {};
  const estimatedAt = estimate.offset?.date || estimate.date || '';
  const estimatedLimit = lead.estimated_delivery_limit?.date || estimatedAt;
  const terminal = ['delivered', 'canceled'].includes(state);
  const delayed = !terminal && activeDelay(details.delays ?? parseJson(row.delays_json, null), substatus);
  // ML lead_time dates express an estimated delivery day, not an appointment hour.
  const overdue = !terminal && Boolean(estimatedLimit) && localDay(now.toISOString()) > localDay(estimatedLimit);
  const syncedAt = row.details_synced_at || '';
  const stale = Boolean(row.sync_error) || !syncedAt || now.getTime() - Date.parse(syncedAt.includes('T') ? syncedAt : `${syncedAt.replace(' ', 'T')}Z`) > 26 * 3600_000;
  return { state, stateLabel: STATE_LABELS[state], status, substatus, history,
    dispatchedAt, dispatchDay: localDay(dispatchedAt), deliveredAt, deliveryDay: localDay(deliveredAt),
    estimatedAt, estimatedDay: localDay(estimatedAt), estimatedDateOnly: true, delayed, overdue,
    incident: ['attempt', 'problem'].includes(state), incidentReason: ['attempt', 'problem'].includes(state) ? deliveryEventLabel({status,substatus}) : '',
    syncedAt, stateSyncedAt: row.synced_at || '', stale, syncError: row.sync_error || '' };
}

export function preserveMercadoLibreDetails(payload, old) {
  if (!old) return payload;
  const merged = { ...payload };
  if (!merged.shipment) merged.shipment = parseJson(old.raw_shipment_json, null);
  for (const [key, column, fallback] of [['leadTime','lead_time_json',{}],['delays','delays_json',null],['carrier','carrier_json',null],['history','history_json',[]]]) {
    if (merged[key] === undefined) merged[key] = parseJson(old[column], fallback);
  }
  return merged;
}

export function shipmentFinanceStatement(workspaceId, payload, connectionId, now = new Date().toISOString()) {
  const shipmentId = String(payload.shipment?.id || payload.order?.shipping?.id || '');
  if (!shipmentId || !connectionId) return null;
  const keys = ['shipment','leadTime','delays','history'].filter((key) => payload[key] !== undefined && (key !== 'shipment' || payload[key]));
  const errors = payload.syncErrors || [];
  const details = Object.fromEntries(keys.map((key) => [key,payload[key]]));
  const merge = keys.length ? `json_set(COALESCE(shipment_finance.details_json,'{}'),${keys.map((key) => `'$.${key}',json(?)`).join(',')})` : 'shipment_finance.details_json';
  return {
    sql: `INSERT INTO shipment_finance(workspace_id,connection_id,shipment_id,costs_json,costs_synced_at,details_json,details_synced_at,sync_error,last_attempt_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,connection_id,shipment_id) DO UPDATE SET
      costs_json=CASE WHEN excluded.costs_synced_at IS NOT NULL THEN excluded.costs_json ELSE shipment_finance.costs_json END,
      costs_synced_at=COALESCE(excluded.costs_synced_at,shipment_finance.costs_synced_at),
      details_json=${merge},details_synced_at=COALESCE(excluded.details_synced_at,shipment_finance.details_synced_at),
      sync_error=CASE WHEN ? THEN excluded.sync_error ELSE shipment_finance.sync_error END,last_attempt_at=excluded.last_attempt_at`,
    args: [workspaceId,Number(connectionId),shipmentId,payload.costs !== undefined ? JSON.stringify(payload.costs) : null,
      payload.costs !== undefined ? now : null,JSON.stringify(details),keys.length && !payload.light && !errors.length ? now : null,
      errors.length ? errors.join('; ') : null,now,...keys.map((key) => JSON.stringify(payload[key])), errors.length || !payload.light ? 1 : 0],
  };
}
export function chooseRate(rates, { carrierId, zone, dispatchDay }) {
  if (!carrierId || !zone || !validDate(dispatchDay)) return null;
  return rates.filter((r) => Number(r.carrier_id) === Number(carrierId) && r.zone === zone && r.valid_from <= dispatchDay)
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0] || null;
}
export function financeRecord(row, rates, now) {
  const facts = deliveryFacts(row, now);
  const saved = parseJson(row.responsibility_json, null);
  const pricing = parseJson(row.pricing_json, null);
  const address = parseJson(row.address_json);
  const party = saved?.partido || row.partido || resolvePartidoFromGeo(address.municipality?.name || address.city?.name || '', address.state?.name || '') || '';
  const zone = saved?.zone || zoneForPartido(party) || '';
  const carrierId = saved?.carrierId || Number(row.carrier_id) || null;
  const carrierName = saved?.carrierName || row.carrier_display_name || row.assigned_carrier || '';
  const dispatchDay = saved?.dispatchDay || facts.dispatchDay;
  const method = row.logistic_type === 'self_service' || row.shipping_method === 'flex' ? 'flex'
    : ['cross_docking', 'xd_drop_off', 'drop_off'].includes(row.logistic_type) || row.shipping_method === 'colecta' && row.logistic_type !== 'fulfillment' ? 'colecta' : 'other';
  const rate = method === 'flex' ? chooseRate(rates, { carrierId, zone, dispatchDay }) : null;
  let missing = '';
  let amountCents = null;
  if (method === 'flex') {
    if (!carrierId) missing = 'Sin transportista';
    else if (!zone) missing = 'Sin zona';
    else if (!dispatchDay) missing = 'Sin fecha de despacho confirmada';
    else if (!rate && !pricing) missing = 'Sin tarifa';
    else amountCents = Number(pricing?.amountCents ?? rate.amount_cents);
  } else if (method === 'colecta') {
    amountCents = sellerCost(parseJson(row.costs_json, null), row.user_id || row.external_store_id);
    if (amountCents === null) missing = 'Costo no disponible';
    if (row.currency && row.currency !== 'ARS') { amountCents = null; missing = 'Moneda no compatible: se requiere ARS'; }
  }
  if (method === 'flex' && ['canceled','problem'].includes(facts.state)) {
    amountCents = null;
    missing = 'No liquidable: cancelado o no entregado';
  }
  const locked = parseJson(row.locked_snapshot_json, null);
  if (locked) amountCents = Number(row.locked_amount_cents);
  return { ...facts, connectionId: Number(row.integration_connection_id), shipmentId: String(row.shipment_id),
    orderId: row.order_id, sellerId: row.user_id || row.external_store_id, recipient: row.recipient_name || '',
    method, partido: locked?.partido || party, zone: locked?.zone || zone,
    carrierId: method === 'colecta' ? null : locked?.carrierId || carrierId,
    carrierName: method === 'colecta' ? parseJson(row.carrier_json, {})?.name || 'Mercado Libre · Colecta' : locked?.carrierName || carrierName,
    dispatchDay: locked?.dispatchDay || dispatchDay, rateId: locked?.rateId || pricing?.rateId || rate?.id || null,
    amountCents, missing: locked ? '' : missing, settlementId: row.settlement_id || null,
    internalPrintedAt: row.label_printed_at || '', internalImportedAt: row.label_imported_at || '',
    costsSyncedAt: row.costs_synced_at || '', responsibility: saved, pricing };
}
export function filterRecords(rows, filters = {}) {
  const zones = String(filters.zones || '').split(',').filter(Boolean);
  return rows.filter((r) => {
    const date = filters.dateBasis === 'delivery' ? r.deliveryDay : r.dispatchDay;
    if (filters.from && (!date || date < filters.from) || filters.to && (!date || date > filters.to)) return false;
    if (zones.length && !zones.includes(r.zone || '__missing__')) return false;
    for (const [key, field] of [['connectionId','connectionId'], ['method','method'], ['carrierId','carrierId'], ['zone','zone'], ['partido','partido'], ['state','state']]) {
      if (filters[key] === '__missing__') { if (r[field]) return false; continue; }
      if (filters[key] && String(r[field]) !== String(filters[key])) return false;
    }
    if (filters.alert === 'delayed' && !r.delayed && !r.overdue) return false;
    if (filters.alert === 'incident' && !r.incident) return false;
    if (filters.alert === 'today' && r.estimatedDay !== localDay(new Date().toISOString())) return false;
    return true;
  });
}
export function summarize(rows) {
  const known = rows.filter((r) => r.amountCents !== null);
  const sum = (list) => list.reduce((n, r) => n + r.amountCents, 0);
  const flex = known.filter((r) => r.method === 'flex');
  const colecta = known.filter((r) => r.method === 'colecta');
  const sales = rows.filter((r) => r.salesCents !== null && r.salesCents !== undefined);
  const salesCents = sales.length ? sales.reduce((n, r) => n + r.salesCents, 0) : null;
  // Compare only packages with complete sales and costs; avoid mismatched denominators.
  const comparable = rows.filter((r) => r.amountCents !== null && r.salesCents > 0 && !r.salesMissingCount);
  const comparableSalesCents = comparable.reduce((n, r) => n + r.salesCents, 0);
  const comparableCostCents = sum(comparable);
  const paidKnownOrderCount = rows.reduce((n, r) => n + (r.paidKnownOrderCount || 0), 0);
  return { count: rows.length, knownCount: known.length, missingCount: rows.length - known.length,
    salesCents, paidOrderCount: rows.reduce((n, r) => n + (r.paidOrderCount || 0), 0),
    paidKnownOrderCount, averageSaleCents: paidKnownOrderCount && salesCents !== null ? Math.round(salesCents / paidKnownOrderCount) : null,
    salesMissingCount: rows.reduce((n, r) => n + (r.salesMissingCount || 0), 0),
    salesUnavailableCount: rows.filter((r) => r.salesCents === null || r.salesCents === undefined).length,
    comparableCount: comparable.length, comparableSalesCents, comparableCostCents,
    logisticsPercent: comparableSalesCents ? comparableCostCents / comparableSalesCents * 100 : null,
    flexCents: sum(flex), colectaCents: sum(colecta), totalCents: sum(known),
    averageCents: known.length ? Math.round(sum(known) / known.length) : null,
    estimatedFlexCents: sum(flex.filter((r) => !['delivered', 'canceled', 'problem'].includes(r.state))),
    payableFlexCents: sum(flex.filter((r) => r.state === 'delivered' && r.deliveryDay && !r.settlementId)),
    delayed: rows.filter((r) => r.delayed || r.overdue).length, incidents: rows.filter((r) => r.incident).length };
}
export function groupRecords(rows, key) {
  const groups = new Map();
  for (const row of rows) { const value = row[key] || 'Sin dato'; if (!groups.has(value)) groups.set(value, []); groups.get(value).push(row); }
  return [...groups].map(([name, records]) => ({ name, ...summarize(records) })).sort((a, b) => b.totalCents - a.totalCents);
}
export function settlementCandidates(rows, carrierId, from, to) {
  return rows.filter((r) => r.method === 'flex' && r.state === 'delivered' && r.amountCents !== null && !r.missing
    && !r.settlementId && Number(r.carrierId) === Number(carrierId) && r.deliveryDay && r.deliveryDay >= from && r.deliveryDay <= to);
}
export function csv(rows, columns) {
  const cell = (value) => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [columns.map(([name]) => cell(name)).join(';'), ...rows.map((r) => columns.map(([, key]) => cell(typeof key === 'function' ? key(r) : r[key])).join(';'))].join('\r\n');
}
