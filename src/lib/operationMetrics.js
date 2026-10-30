const lower = (value) => String(value || '').trim().toLowerCase();

// Same Colecta types as the finance report (logisticsFinance.financeRecord).
const COLECTA_LOGISTIC_TYPES = ['cross_docking', 'xd_drop_off', 'drop_off'];

function shippingMethod(order) {
  const logisticType = lower(order.logisticType);
  const method = lower(order.shippingMethod);
  if (logisticType.includes('self_service') || method === 'flex') return 'flex';
  if (logisticType === 'fulfillment') return '';
  if (COLECTA_LOGISTIC_TYPES.some((type) => logisticType.includes(type)) || method === 'colecta') return 'colecta';
  return '';
}

// Paquetes físicos listos para imprimir: un pack de Mercado Libre puede tener
// más de una venta, pero sale en un solo paquete, así que se cuenta un shipment una vez.
function packingShipments(orders) {
  const nextToPack = orders.filter((order) => {
    const status = lower(order.shipmentStatus);
    const substatus = lower(order.shipmentSubstatus);
    // Replica el estado de la etiqueta en Mercado Libre. No depende de si
    // GeoModi ya descargó/importó la etiqueta ni de la cola de impresión local.
    return status === 'ready_to_ship'
      && substatus === 'ready_to_print'
      && Boolean(shippingMethod(order));
  });
  return [...new Map(nextToPack.map((order, index) => [
    String(order.shipmentId || order.id || `row-${index}`),
    order,
  ])).values()];
}

// This card is for the picker, not the commercial order history.
export function getMercadoLibrePackingMetrics(orders = []) {
  const shipments = packingShipments(orders);
  return {
    total: shipments.length,
    flex: shipments.filter((order) => shippingMethod(order) === 'flex').length,
    colecta: shipments.filter((order) => shippingMethod(order) === 'colecta').length,
  };
}

// Detail behind each card: packages per Mercado Libre account, largest first.
export function getMercadoLibrePackingBreakdown(orders = []) {
  const breakdown = { flex: new Map(), colecta: new Map() };
  for (const order of packingShipments(orders)) {
    const accounts = breakdown[shippingMethod(order)];
    const account = order.account || 'Mercado Libre';
    accounts.set(account, (accounts.get(account) || 0) + 1);
  }
  const rows = (accounts) => [...accounts].map(([account, count]) => ({ account, count })).sort((a, b) => b.count - a.count);
  return { flex: rows(breakdown.flex), colecta: rows(breakdown.colecta) };
}
