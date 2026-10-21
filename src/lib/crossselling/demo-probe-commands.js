export const DEMO_STORE_ID = '7570182';

// Sonda temporal, exclusivamente para la demo. Nunca interpreta precios del navegador.
export function demoProbeCommands(state, cart, now = Date.now()) {
  if (!state?.promotionId || String(cart.store_id) !== DEMO_STORE_ID || cart.execution_tier !== 'line_item') return [];
  const remove = [{ command: 'remove_discount', specs: { scope: 'cart', promotion_ids: [state.promotionId] } }];
  if (!state.enabled || state.expiresAt <= now || state.cartId !== String(cart.cart_id) ||
      cart.currency !== 'ARS' || cart.coupons?.length) return remove;
  const products = cart.products || [];
  const valid = (p) => Number.isInteger(p.quantity) && p.quantity > 0;
  if (!products.some((p) => String(p.variant_id) === state.triggerVariant && valid(p))) return remove;
  const line = products.find((p) => String(p.variant_id) === state.accessoryVariant && valid(p) && Number(p.price) > 1);
  if (!line) return remove;
  return [{ command: 'create_or_update_discount', specs: { promotion_id: state.promotionId, currency: 'ARS',
    display_text: { 'es-ar': 'Prueba Completá tu equipo' },
    line_items: [{ line_item: String(line.id), discount_specs: { type: 'fixed', amount: '1.00' } }] } }];
}
