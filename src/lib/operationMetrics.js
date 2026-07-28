const lower = (value) => String(value || '').trim().toLowerCase();

function shippingMethod(order) {
  const logisticType = lower(order.logisticType);
  const method = lower(order.shippingMethod);
  if (logisticType.includes('self_service') || method === 'flex') return 'flex';
  if (logisticType.includes('cross_docking') || method === 'colecta') return 'colecta';
  return '';
}

// This card is for the picker, not the commercial order history.
export function getMercadoLibrePackingMetrics(orders = []) {
  const nextToPack = orders.filter((order) => {
    const substatus = lower(order.shipmentSubstatus);
    return order.printability?.id === 'printable'
      && substatus === 'ready_to_print'
      && Boolean(shippingMethod(order));
  });

  // Un pack de Mercado Libre puede tener más de una venta, pero sale en un solo
  // paquete. El tablero operativo muestra paquetes físicos, por lo que nunca
  // debe sumar dos veces el mismo shipment.
  const shipments = [...new Map(nextToPack.map((order, index) => [
    String(order.shipmentId || order.id || `row-${index}`),
    order,
  ])).values()];

  return {
    total: shipments.length,
    flex: shipments.filter((order) => shippingMethod(order) === 'flex').length,
    colecta: shipments.filter((order) => shippingMethod(order) === 'colecta').length,
  };
}
