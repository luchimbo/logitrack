import { localDay, parseJson, toCents } from './logisticsFinance.js';
import { provinceKey } from './financeMap.js';
import { resolvePartidoFromGeo } from './zplParser.js';
import { zoneForPartido } from './zoneGroups.js';

// Checkout shipping is separate from products. Missing values must never become zero.
export function tiendanubeShippingAmounts(order) {
  const amount = (value) => {
    const cents = toCents(value);
    return cents !== null && cents >= 0 ? String(cents / 100) : null;
  };
  return { shippingCostCustomer: amount(order?.shipping_cost_customer), shippingCostOwner: amount(order?.shipping_cost_owner) };
}

export function tiendanubeFinanceRecords(rows) {
  const seen = new Set();
  const result = [];
  for (const row of [...rows].sort((a, b) => String(b.synced_at || '').localeCompare(String(a.synced_at || '')) || Number(b.id || 0) - Number(a.id || 0))) {
    const key = `${row.external_store_id || `connection:${row.integration_connection_id || 'legacy'}`}:${row.tiendanube_id}`;
    if (seen.has(key)) continue;
    seen.add(key); // Input is newest first, including copies across connections of one store.
    // Imported Mercado Libre orders are already counted from their original channel.
    if (row.order_source === 'meli' || row.payment_status !== 'paid' || ['cancelled', 'canceled', 'voided'].includes(row.status)) continue;
    const address = parseJson(row.shipping_address_json);
    if (!address || !Object.keys(address).length) continue;
    const ars = row.currency === 'ARS';
    const nonnegative = (value) => { const cents = toCents(value); return cents !== null && cents >= 0 ? cents : null; };
    const collected = ars ? nonnegative(row.shipping_cost_customer) : null;
    const total = ars ? nonnegative(row.total) : null;
    const sales = total !== null && collected !== null && total >= collected ? total - collected : null;
    const cost = ars ? nonnegative(row.shipping_cost_owner) : null;
    const partido = resolvePartidoFromGeo(address.city || address.locality || '', address.province || '') || '';
    const zone = zoneForPartido(partido) || '';
    const state = row.shipping_status === 'delivered' ? 'delivered' : row.shipping_status === 'shipped' || row.dispatch_status === 'dispatched' ? 'in_transit' : 'pending';
    const dispatch = row.dispatched_at_external || (row.dispatch_status === 'dispatched' ? row.dispatch_marked_at : '');
    result.push({ connectionId: row.integration_connection_id ? Number(row.integration_connection_id) : null,
      shipmentId: `tn:${row.external_store_id || row.integration_connection_id || 'legacy'}:${row.tiendanube_id}`,
      orderId: String(row.tiendanube_id), sellerId: row.external_store_id || '', source: 'tiendanube',
      recipient: row.contact_name || address.name || '', method: 'colecta', carrierId: null, carrierName: 'Tiendanube',
      province: zone === 'CABA' ? 'caba' : zone ? 'buenos_aires' : provinceKey(address.province || ''), partido, zone,
      state, stateLabel: state === 'delivered' ? 'Entregado' : state === 'in_transit' ? 'Despachado · Tiendanube' : 'Pendiente de despacho',
      dispatchDay: localDay(dispatch || ''), deliveryDay: '', estimatedDay: '', history: [], delayed: false, overdue: false, incident: false,
      amountCents: cost, missing: cost === null ? 'Costo de envío no informado por Tiendanube' : '', settlementId: null, stale: false,
      salesCents: sales, shippingCollectedCents: collected, paidOrderCount: 1, paidKnownOrderCount: sales === null ? 0 : 1,
      salesMissingCount: sales === null ? 1 : 0, feesCents: null, feesMissingCount: 0, netCents: null });
  }
  return result;
}
