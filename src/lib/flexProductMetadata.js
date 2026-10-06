export function isGenericFlexProductName(value) {
  return String(value || '').trim().toLowerCase() === 'unidad';
}

function safeProducts(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]'); } catch { return []; }
}

export function buildFlexProductMetadata(products) {
  const grouped = new Map();
  for (const product of safeProducts(products)) {
    const name = String(product?.name || '').trim();
    const sku = String(product?.sku || '').trim();
    const quantity = Math.max(1, Number(product?.quantity) || 1);
    if (!name) continue;
    const key = `${name}\u0000${sku}`;
    const current = grouped.get(key) || { name, sku, quantity: 0 };
    current.quantity += quantity;
    grouped.set(key, current);
  }
  const items = [...grouped.values()];
  if (!items.length) return null;
  return {
    product_name: items.map((item) => `${item.name} ×${item.quantity}`).join(' · '),
    sku: items.map((item) => item.sku ? `${item.sku} ×${item.quantity}` : '').filter(Boolean).join(' · '),
    quantity: items.reduce((total, item) => total + item.quantity, 0),
  };
}

export function resolveFlexProductsFromOrderRows(shipments, orderRows) {
  const ordersByTracking = new Map();
  for (const row of orderRows || []) {
    const tracking = String(row.tracking_number || '').trim();
    const shipmentId = String(row.shipment_id || '').trim();
    if (!tracking || !shipmentId) continue;
    const group = ordersByTracking.get(tracking) || new Map();
    const orders = group.get(shipmentId) || [];
    orders.push(row);
    group.set(shipmentId, orders);
    ordersByTracking.set(tracking, group);
  }

  const resolved = new Map();
  const unresolved = [];
  for (const shipment of shipments || []) {
    const tracking = String(shipment.tracking_number || '').trim();
    const candidates = ordersByTracking.get(tracking);
    if (!tracking || !candidates || candidates.size !== 1) {
      unresolved.push(Number(shipment.id));
      continue;
    }
    const orders = [...candidates.values()][0];
    const metadata = buildFlexProductMetadata(orders.flatMap((order) => safeProducts(order.products_json)));
    if (!metadata) {
      unresolved.push(Number(shipment.id));
      continue;
    }
    resolved.set(tracking, metadata);
  }
  return { resolved, unresolved };
}
