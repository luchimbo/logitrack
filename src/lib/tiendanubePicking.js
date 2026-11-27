// Pedidos de Tiendanube guardados localmente → paquetes con la misma forma que los de
// Mercado Libre, para que el picking, el PDF y el registro de exportados los traten igual.

export const TIENDANUBE_PICKING_METHOD = 'tiendanube';

function text(value) {
  if (value && typeof value === 'object') return String(value.es || value.pt || Object.values(value)[0] || '');
  return String(value ?? '');
}

function parseProducts(json) {
  try {
    const parsed = JSON.parse(json || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function tiendanubePickingPackages(rows = []) {
  const packages = [];
  for (const row of rows) {
    const orderId = String(row.tiendanube_id ?? '');
    if (!orderId) continue;
    const products = [];
    for (const product of parseProducts(row.products_json)) {
      const quantity = Number(product?.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) continue;
      const productId = String(product?.product_id ?? product?.id ?? '');
      const variantId = String(product?.variant_id ?? '');
      const baseName = text(product?.name).trim() || `Producto ${productId}`;
      const variants = (Array.isArray(product?.variant_values) ? product.variant_values : []).map(text).filter(Boolean);
      // Tiendanube suele incluir la variante en el nombre ("Remera (Rojo, M)"); no repetirla.
      const extra = variants.filter((value) => !baseName.toLowerCase().includes(value.toLowerCase()));
      products.push({
        key: JSON.stringify(['tiendanube', productId, variantId]),
        // Sin itemId: el catálogo y las notas de picking están indexados por publicación de ML.
        itemId: '',
        name: [baseName, ...extra].join(' · '),
        sku: String(product?.sku || '').trim(),
        color: '',
        quantity,
      });
    }
    if (!products.length) continue;
    packages.push({
      key: JSON.stringify(['tiendanube', String(row.external_store_id || ''), orderId]),
      shippingMethod: TIENDANUBE_PICKING_METHOD,
      products,
    });
  }
  return packages;
}
