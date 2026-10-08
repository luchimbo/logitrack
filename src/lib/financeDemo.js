import { applicableRate, buildFinanceReport, FINANCE_ZONES, packageFromOrder } from './shippingFinance.js';
import { getArgentinaDateString } from './dateUtils.js';
const today = getArgentinaDateString();
const month = today.slice(0, 8) + '01';
export const demoRates = ['Ruta Sur', 'Urbano Express'].flatMap((carrier, n) => FINANCE_ZONES.map((zone, z) => ({ id: n * 4 + z + 1, carrier_name: carrier, zone, effective_from: month, amount_cents: (2200 + n * 350 + z * 700) * 100 })));
export const demoOrders = Array.from({ length: 16 }, (_, i) => {
  const flex = i < 10, delivered = i % 4 !== 0;
  const city = ['Capital Federal', 'San Isidro', 'Quilmes', 'Pilar'][i % 4];
  return { order_id: String(8000 + i), shipment_id: String(9000 + (i === 9 ? 8 : i)), integration_connection_id: i % 2 + 1, user_id: String(i % 2 + 1),
    status: 'paid', currency: 'ARS', total: String(32000 + i * 4000), logistic_type: flex ? 'self_service' : 'cross_docking',
    local_carrier: flex ? i % 2 ? 'Ruta Sur' : 'Urbano Express' : null, local_partido: city,
    address_json: JSON.stringify({ city: { name: city }, state: { name: flex ? 'Buenos Aires' : i % 2 ? 'Córdoba' : 'Santa Fe' } }),
    recipient_name: 'Destinatario de prueba', shipment_status: delivered ? 'delivered' : 'shipped', shipment_substatus: delivered ? '' : 'out_for_delivery',
    created_at_external: `${today}T09:00:00-03:00`, synced_at: `${today}T15:00:00-03:00`,
    raw_shipment_json: JSON.stringify({ date_created: `${today}T09:00:00-03:00`, status_history: { date_delivered: delivered ? `${today}T14:00:00-03:00` : null } }),
    lead_time_json: JSON.stringify({ estimated_delivery_time: { date: `${today}T${i % 3 ? '18' : '12'}:00:00-03:00` } }),
    history_json: JSON.stringify([{ status: 'shipped', date: `${today}T10:00:00-03:00` }, ...(delivered ? [{ status: 'delivered', date: `${today}T14:00:00-03:00` }] : [])]),
  };
});
const charges = demoOrders.filter(o => o.logistic_type === 'self_service' && o.shipment_status === 'delivered').map(o => {
  const p = packageFromOrder(o);
  return { package_key: p.key, carrier_name: p.carrier, zone: p.zone, amount_cents: applicableRate(demoRates, p.carrier, p.zone, today).amount_cents };
});
const costs = demoOrders.filter(o => o.logistic_type !== 'self_service').map(o => ({ connection_id: o.integration_connection_id, shipment_id: o.shipment_id, amount_cents: Number(o.order_id) % 3 ? 620000 : null }));
export const financeDemo = { rates: demoRates, carriers: [{ name: 'Ruta Sur' }, { name: 'Urbano Express' }], report: filters => ({ ...buildFinanceReport({ orders: demoOrders, rates: demoRates, charges, costs, filters }), connections: [{ id: 1, display_name: 'Tienda de prueba' }, { id: 2, display_name: 'Segunda cuenta' }] }) };
