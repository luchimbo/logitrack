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
    const status = lower(order.shipmentStatus);
    const substatus = lower(order.shipmentSubstatus);
    const logisticType = lower(order.logisticType);
    return status === 'ready_to_ship'
      && logisticType !== 'fulfillment'
      && !['ready_for_pickup', 'printed'].includes(substatus)
      && Boolean(shippingMethod(order));
  });

  return {
    total: nextToPack.length,
    flex: nextToPack.filter((order) => shippingMethod(order) === 'flex').length,
    colecta: nextToPack.filter((order) => shippingMethod(order) === 'colecta').length,
  };
}
