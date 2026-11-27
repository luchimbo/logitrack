// CSV que Excel en español abre directo: separador ";", BOM UTF-8 y celdas entre comillas.
// Las celdas que empiezan con = + - @ se prefijan con ' para que Excel no las ejecute como fórmula.

export const CSV_MAX_ROWS = 20_000;

export function csv(rows, columns) {
  const cell = (value) => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text) && !/^-\d+(,\d+)?$/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '﻿' + [
    columns.map(([name]) => cell(name)).join(';'),
    ...rows.map((row) => columns.map(([, key]) => cell(typeof key === 'function' ? key(row) : row[key])).join(';')),
  ].join('\r\n');
}

export function csvFileName(base, date = new Date()) {
  const day = new Date(date).toISOString().slice(0, 10);
  return `${base}-${day}`.replace(/[^\w.-]+/g, '-');
}

export function csvResponse(rows, columns, name) {
  return new Response(csv(rows, columns), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

// Solo navegador: descarga un CSV armado con datos que la pantalla ya tiene cargados.
export function downloadCsv(rows, columns, name) {
  const url = URL.createObjectURL(new Blob([csv(rows, columns)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const productsText = (products) => (Array.isArray(products) ? products : [])
  .map((product) => {
    const name = typeof product?.name === 'object' ? (product.name.es || Object.values(product.name)[0] || '') : (product?.name || '');
    return `${product?.quantity || 1} x ${name}${product?.sku ? ` [${product.sku}]` : ''}`;
  })
  .join(' | ');

export const SHIPMENT_CSV_COLUMNS = [
  ['Fecha de carga', 'created_at'],
  ['Despacho', 'dispatch_date'],
  ['Método', 'shipping_method'],
  ['Estado', 'status'],
  ['Transportista', (row) => row.assigned_carrier || row.carrier_name || ''],
  ['Tracking', 'tracking_number'],
  ['Venta', 'sale_id'],
  ['Producto', 'product_name'],
  ['SKU', 'sku'],
  ['Cantidad', 'quantity'],
  ['Destinatario', 'recipient_name'],
  ['Dirección', 'address'],
  ['CP', 'postal_code'],
  ['Localidad', 'city'],
  ['Partido', 'partido'],
  ['Provincia', 'province'],
  ['Origen', 'external_provider'],
];

export const PACKAGE_HISTORY_CSV_COLUMNS = [
  ['Fecha de carga', 'created_at'],
  ['Despacho', 'dispatch_date'],
  ['Estado', 'status'],
  ['Transportista', 'carrier'],
  ['Tracking', 'tracking_number'],
  ['Venta', 'sale_id'],
  ['Pedido externo', 'external_order_id'],
  ['Envío externo', 'external_shipment_id'],
  ['Producto', 'product_name'],
  ['SKU', 'sku'],
];

export const TIENDANUBE_ORDER_CSV_COLUMNS = [
  ['Pedido', 'number'],
  ['Fecha', 'createdAt'],
  ['Cliente', 'contactName'],
  ['Email', 'contactEmail'],
  ['Teléfono', 'contactPhone'],
  ['Estado', 'status'],
  ['Pago', 'paymentStatus'],
  ['Envío', 'shippingStatus'],
  ['Despacho', (order) => (order.dispatchStatus === 'dispatched' ? 'Enviado' : 'Por enviar')],
  ['Método de envío', 'shippingMethod'],
  ['Transportista', 'shippingCarrier'],
  ['Productos', (order) => productsText(order.products)],
  ['Total', 'total'],
  ['Moneda', 'currency'],
];

export const PICKING_CATALOG_CSV_COLUMNS = [
  ['Producto', 'title'],
  ['SKU', (item) => (item.skus || []).join(' ')],
  ['Activo', (item) => (item.active ? 'Sí' : 'No')],
  ['Texto de picking', 'note'],
  ['Cuentas', (item) => (item.accounts || []).join(', ')],
  ['Publicaciones', (item) => (item.listings || []).map((listing) => listing.item_id).join(' ')],
];
