// Ventas online de cross-selling: atribución de pedidos de Tiendanube a ofertas aceptadas.
// Lógica pura: el pedido llega del webhook y las aceptaciones de la base.
import { round2 } from './engine/pricing.js';

export const ATTRIBUTION_WINDOW_MS = 6 * 60 * 60_000;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Día de Argentina (UTC-3) para agrupar las métricas como el informe del mostrador.
export function dayAR(date) {
  const d = new Date(new Date(date).getTime() - 3 * 60 * 60_000);
  return d.toISOString().slice(0, 10);
}

export function orderSummary(order) {
  return {
    orderId: String(order.id), number: order.number != null ? String(order.number) : '',
    createdAt: new Date(order.created_at || Date.now()).toISOString(),
    total: round2(num(order.total)), paid: order.payment_status === 'paid',
    cancelled: order.status === 'cancelled' || ['voided', 'refunded'].includes(order.payment_status),
  };
}

// ¿Tiendanube registró un descuento de promociones en el pedido? Si informa las promociones
// aplicadas, exige la nuestra; si no las detalla, alcanza con que haya un descuento promocional.
export function hasOurDiscount(order, promotionId) {
  const pd = order.promotional_discount || {};
  const applied = Array.isArray(pd.promotions_applied) ? pd.promotions_applied : [];
  if (applied.length) return applied.some((p) => String(p?.id ?? p?.promotion_id ?? p) === String(promotionId));
  return num(pd.total_discount_amount) > 0;
}

// Una fila por accesorio aceptado que entró en el pedido. Se toma la aceptación más reciente
// anterior al pedido (hasta 6 h) cuyo principal también está en el pedido.
export function attributeOrder({ order, acceptances, promotionId }) {
  if (!promotionId || !hasOurDiscount(order, promotionId)) return [];
  const created = new Date(order.created_at || Date.now()).getTime();
  const lines = (order.products || []).map((p) => ({ variantId: String(p.variant_id), name: p.name || '',
    quantity: Math.max(0, Math.trunc(num(p.quantity))), price: num(p.price) }));
  const qtyOf = (variantId) => lines.filter((l) => l.variantId === variantId).reduce((n, l) => n + l.quantity, 0);
  const rows = [];
  for (const line of lines) {
    if (!line.quantity || rows.some((r) => r.variantId === line.variantId)) continue;
    const acceptance = acceptances
      .filter((a) => String(a.accessoryVariant) === line.variantId && qtyOf(String(a.triggerVariant)) > 0)
      .filter((a) => { const t = new Date(a.acceptedAt).getTime(); return t <= created + 10 * 60_000 && created - t <= ATTRIBUTION_WINDOW_MS; })
      .sort((a, b) => new Date(b.acceptedAt) - new Date(a.acceptedAt))[0];
    if (!acceptance) continue;
    const covered = Math.min(line.quantity, qtyOf(String(acceptance.triggerVariant)));
    const discount = round2(line.price * covered * num(acceptance.pct) / 100);
    rows.push({ variantId: line.variantId, ruleId: String(acceptance.ruleId || ''), productName: line.name,
      quantity: line.quantity, discount, revenue: round2(line.price * line.quantity - discount) });
  }
  return rows;
}

// Suma de contadores diarios {shown:<regla>, accepted:<regla>} por regla.
export function sumDailyCounters(days) {
  const byRule = {};
  for (const day of days) {
    for (const [field, value] of Object.entries(day || {})) {
      const [kind, ...rest] = field.split(':');
      const ruleId = rest.join(':');
      if (!ruleId || !['shown', 'accepted'].includes(kind)) continue;
      byRule[ruleId] ||= { shown: 0, accepted: 0 };
      byRule[ruleId][kind] += num(value);
    }
  }
  return byRule;
}

export function daysBetween(from, to, max = 400) {
  const days = [];
  for (const d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to && days.length < max; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}
