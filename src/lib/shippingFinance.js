import { zoneForPartido, normalizeName } from './zoneGroups.js';
import { getArgentinaDateString } from './dateUtils.js';

export const FINANCE_ZONES = ['CABA', 'GBA 1', 'GBA 2', 'GBA 3'];
export function parseStored(value, fallback = {}) {
  try { return typeof value === 'string' ? JSON.parse(value) : value || fallback; } catch { return fallback; }
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function moneyCents(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && Number.isSafeInteger(Math.round(n * 100)) ? Math.round(n * 100) : null;
}
export function applicableRate(rates, carrier, zone, date) {
  if (!date) return null;
  return rates.filter(r => r.carrier_name === carrier && r.zone === zone && r.effective_from <= date)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || Number(b.id) - Number(a.id))[0] || null;
}
export function sellerShippingCost(costs, sellerId) {
  const sender = Array.isArray(costs?.senders) ? costs.senders.find(s => String(s.user_id) === String(sellerId)) : null;
  return sender ? moneyCents(sender.cost) : null;
}
export function packageFromOrder(row) {
  const raw = parseStored(row.raw_shipment_json);
  const address = parseStored(row.address_json);
  const storedHistory = parseStored(row.history_json, []);
  const history = Array.isArray(storedHistory) ? storedHistory : [];
  const lead = parseStored(row.lead_time_json);
  const deliveredAt = raw.status_history?.date_delivered || history.find(e => e.status === 'delivered')?.date || '';
  const deadline = lead.estimated_delivery_time?.date || lead.estimated_delivery_time?.to || '';
  const province = row.local_province || address.state?.name || 'Sin provincia';
  const partido = row.local_partido || address.city?.name || '';
  const modality = row.logistic_type === 'self_service' ? 'flex'
    : ['cross_docking', 'xd_drop_off', 'drop_off', 'pickup'].includes(row.logistic_type) ? 'colecta' : 'otros';
  const now = Date.now();
  const end = row.shipment_status === 'delivered' ? Date.parse(deliveredAt) : now;
  const delayed = Boolean(deadline && Number.isFinite(end) && end > Date.parse(deadline)
    && !['cancelled', 'canceled', 'not_delivered'].includes(row.shipment_status));
  return {
    key: `${row.integration_connection_id}:${row.shipment_id || `order-${row.order_id}`}`,
    shipmentId: row.shipment_id, connectionId: row.integration_connection_id, sellerId: row.user_id,
    modality, province, zone: zoneForPartido(partido) || (['capital_federal', 'caba', 'ciudad_autonoma_de_buenos_aires'].includes(normalizeName(province)) ? 'CABA' : null),
    carrier: row.local_carrier || null, status: row.shipment_status || 'pending', substatus: row.shipment_substatus || '',
    deliveredAt, deliveryDate: deliveredAt ? getArgentinaDateString(deliveredAt) : '',
    createdDate: getArgentinaDateString(raw.date_created || row.created_at_external),
    deadline, delayed, history, syncedAt: row.synced_at, shipmentUpdatedAt: raw.last_updated || row.synced_at || '',
    recipient: row.recipient_name || '',
  };
}
export function buildFinanceReport({ orders, rates, charges = [], costs = [], filters = {} }) {
  const chargeMap = new Map(charges.map(c => [c.package_key, c]));
  const costMap = new Map(costs.map(c => [`${c.connection_id}:${c.shipment_id}`, c]));
  const packages = new Map();
  const seenOrders = new Set();
  const matches = p => (!filters.connection || String(p.connectionId) === String(filters.connection))
    && (!filters.modality || p.modality === filters.modality) && (!filters.carrier || p.carrier === filters.carrier)
    && (!filters.region || (p.modality === 'flex' ? p.zone || 'Sin zona' : p.province) === filters.region);
  const inRange = d => Boolean(d) && (!filters.from || d >= filters.from) && (!filters.to || d <= filters.to);
  const groups = new Map();
  function group(p) {
    const region = p.modality === 'flex' ? p.zone || 'Sin zona' : p.province;
    const key = `${p.modality}:${region}`;
    if (!groups.has(key)) groups.set(key, { region, modality: p.modality, salesCents: 0, costCents: 0, packages: 0, delivered: 0, pendingCosts: 0, delayed: 0 });
    return groups.get(key);
  }
  let unknownSales = 0;
  for (const row of orders) {
    const p = packageFromOrder(row);
    const snapshot = chargeMap.get(p.key);
    if (snapshot) Object.assign(p, { carrier: snapshot.carrier_name, zone: snapshot.zone, ...(snapshot.delivery_date ? { deliveryDate: snapshot.delivery_date } : {}) });
    if (!matches(p)) continue;
    const orderKey = `${row.integration_connection_id}:${row.order_id}`;
    if (!seenOrders.has(orderKey) && row.status === 'paid' && inRange(getArgentinaDateString(row.created_at_external))) {
      seenOrders.add(orderKey);
      const total = row.currency === 'ARS' ? moneyCents(row.total) : null;
      if (total === null) unknownSales++; else group(p).salesCents += total;
    }
    const previous = packages.get(p.key);
    if (!previous || p.shipmentUpdatedAt >= previous.shipmentUpdatedAt) packages.set(p.key, p);
  }
  const details = [];
  for (const p of packages.values()) {
    if (!inRange(p.createdDate) && !inRange(p.deliveryDate)) continue;
    const g = group(p);
    g.packages += Number(Boolean(p.shipmentId)); g.delivered += Number(p.status === 'delivered' && inRange(p.deliveryDate)); g.delayed += Number(p.delayed);
    let costCents = null, reason = '', costDate = p.modality === 'flex' ? p.deliveryDate : p.createdDate;
    if (p.modality === 'flex') {
      const charge = chargeMap.get(p.key);
      if (charge) costCents = Number(charge.amount_cents);
      else if (p.status !== 'delivered') reason = 'Aún no entregado';
      else reason = !p.deliveryDate ? 'Sin fecha de entrega' : !p.carrier ? 'Sin transportista' : !p.zone ? 'Sin zona' : 'Sin tarifa registrada';
    } else if (p.modality === 'colecta') {
      const stored = costMap.get(p.key);
      costCents = stored?.amount_cents === null || stored?.amount_cents === undefined ? null : Number(stored.amount_cents);
      if (costCents === null) reason = 'Costo ML no disponible';
    } else reason = 'Modalidad fuera de alcance';
    if (inRange(costDate)) {
      if (costCents !== null) g.costCents += costCents;
      else if (p.modality === 'colecta' || (p.modality === 'flex' && p.status === 'delivered')) g.pendingCosts++;
    } else if (p.modality === 'flex' && p.status === 'delivered' && !p.deliveryDate) g.pendingCosts++;
    details.push({ ...p, costCents, costDate, costReason: reason });
  }
  const grouped = [...groups.values()];
  const totals = grouped.reduce((sum, g) => {
    for (const k of ['salesCents', 'costCents', 'packages', 'delivered', 'pendingCosts', 'delayed']) sum[k] += g[k];
    return sum;
  }, { salesCents: 0, costCents: 0, packages: 0, delivered: 0, pendingCosts: 0, delayed: 0 });
  return { totals, groups: grouped, packages: details, unknownSales, rates };
}
