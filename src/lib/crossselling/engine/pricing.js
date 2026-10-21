// Cálculos de precios. Todos los precios del catálogo son FINALES (con IVA),
// que es lo que ve el cliente. Para la factura se pasan a neto en invoice.js.

export const round2 = (n) => Math.round(n * 100) / 100;

export const METODOS_PAGO = {
  mercadopago: { nombre: "MercadoPago", contado: false },
  otros: { nombre: "Otros", contado: false },
  efectivo: { nombre: "Efectivo", contado: true },
  transferencia: { nombre: "Transferencia", contado: true },
  debito: { nombre: "Tarjeta de débito", contado: false },
  credito: { nombre: "Tarjeta de crédito", contado: false },
};

// Transferencia por MercadoPago: se factura con la condición MercadoPago pero lleva el descuento de contado.
export function esContado(metodo, { transferencia = false } = {}) {
  return Boolean(METODOS_PAGO[metodo]?.contado) || (metodo === "mercadopago" && transferencia);
}

// Combina dos descuentos sucesivos (ej: 10% recomendación + 5% contado = 14,5%).
export function combinarDescuentos(...pcts) {
  const factor = pcts.reduce((acc, p) => acc * (1 - (p || 0) / 100), 1);
  return round2((1 - factor) * 100);
}

// Descuento de recomendación permitido para un producto, respetando el tope
// global y el margen mínimo sobre el costo (si el costo es conocido).
export function descuentoSeguro(product, pctPedido, settings) {
  let pct = Math.max(0, Math.min(pctPedido || 0, settings.descuentoMaximoPct));
  if (product.costo > 0 && product.precioFinal > 0) {
    const netoSinIva = product.precioFinal / (1 + (product.iva ?? 21) / 100);
    const pisoNeto = product.costo * (1 + settings.margenMinimoPct / 100);
    const maxPorMargen = (1 - pisoNeto / netoSinIva) * 100;
    pct = Math.min(pct, Math.max(0, Math.floor(maxPorMargen)));
  }
  return pct;
}

export function calcularLinea(line) {
  const bruto = round2(line.precioFinal * line.cantidad);
  const descuento = round2(bruto * (line.descuentoPct || 0) / 100);
  return { bruto, descuento, total: round2(bruto - descuento) };
}

// Cross-selling: por defecto es todo lo que se suma al producto principal, el más caro de la venta
// (precio unitario; si empatan, el que se cargó primero). El vendedor puede cambiarlo línea por línea
// (crossSelling true/false); null o ausente = automático. Las líneas necesitan su total.
export function marcarCrossSelling(lineas = []) {
  const unitario = (l) => l.total / (l.cantidad || 1);
  const principal = lineas.reduce((mejor, l, j) => (unitario(l) > unitario(lineas[mejor]) ? j : mejor), 0);
  return lineas.map((l, j) => ({ ...l, crossSelling: typeof l.crossSelling === "boolean" ? l.crossSelling : j !== principal }));
}

export function calcularTotales(lines, metodoPago, settings, { transferencia = false } = {}) {
  let subtotal = 0;
  let descuentoRecomendaciones = 0;
  for (const line of lines) {
    const c = calcularLinea(line);
    subtotal += c.bruto;
    descuentoRecomendaciones += c.descuento;
  }
  subtotal = round2(subtotal);
  descuentoRecomendaciones = round2(descuentoRecomendaciones);
  const total = round2(subtotal - descuentoRecomendaciones);
  const descuentoContado = round2(total * settings.descuentoContadoPct / 100);
  const totalContado = round2(total - descuentoContado);
  const aplicaContado = esContado(metodoPago, { transferencia });
  return {
    subtotal,
    descuentoRecomendaciones,
    total,
    totalContado,
    descuentoContadoPct: settings.descuentoContadoPct,
    aplicaContado,
    descuentoContado: aplicaContado ? descuentoContado : 0,
    totalAPagar: aplicaContado ? totalContado : total,
  };
}

// Total ajustado por el vendedor: se reparte entre las líneas en proporción a lo que
// pagaría cada una (con descuentos). Los centavos que sobran van a la línea más grande.
export function repartirTotal(lines, pctContado, total) {
  const bases = lines.map((l) => calcularLinea(l).total * (1 - (pctContado || 0) / 100));
  const suma = bases.reduce((a, b) => a + b, 0);
  const partes = bases.map((b) => round2(suma ? (total * b) / suma : total / lines.length));
  const mayor = bases.indexOf(Math.max(...bases));
  partes[mayor] = round2(partes[mayor] + total - partes.reduce((a, b) => a + b, 0));
  return partes;
}
