import test from 'node:test';
import assert from 'node:assert/strict';
import { attributeOrder, dayAR, daysBetween, hasOurDiscount, orderSummary, sumDailyCounters } from '../src/lib/crossselling/online-sales.js';

const promotionId = '9a1ad522-5ea6-41d9-8735-e654876eaf91';
const acceptance = { ruleId: 'r-funda', accessoryVariant: '111059140', triggerVariant: '65903756', pct: 10, acceptedAt: '2026-10-19T14:00:00.000Z' };
const order = {
  id: 1501, number: 9001, created_at: '2026-10-19T14:20:00+0000', total: '77849.77', payment_status: 'paid', status: 'open',
  promotional_discount: { total_discount_amount: '705.59', promotions_applied: [{ id: promotionId }] },
  products: [{ variant_id: 111059140, name: 'FUNDA PARA TECLADO MEIKE CHICA', quantity: 1, price: '7055.88' },
    { variant_id: 65903756, name: 'Teclado MK2083', quantity: 1, price: '71499.48' }],
};

test('atribuye el accesorio aceptado cuando el pedido trae nuestro descuento y el principal', () => {
  assert.deepEqual(attributeOrder({ order, acceptances: [acceptance], promotionId }), [
    { variantId: '111059140', ruleId: 'r-funda', productName: 'FUNDA PARA TECLADO MEIKE CHICA', quantity: 1, discount: 705.59, revenue: 6350.29 },
  ]);
});

test('no atribuye sin descuento nuestro, sin principal, fuera de la ventana o sin aceptación', () => {
  assert.deepEqual(attributeOrder({ order: { ...order, promotional_discount: { total_discount_amount: '0', promotions_applied: [] } }, acceptances: [acceptance], promotionId }), []);
  assert.deepEqual(attributeOrder({ order: { ...order, promotional_discount: { promotions_applied: [{ id: 'otra' }] } }, acceptances: [acceptance], promotionId }), []);
  assert.deepEqual(attributeOrder({ order: { ...order, products: order.products.slice(0, 1) }, acceptances: [acceptance], promotionId }), []);
  assert.deepEqual(attributeOrder({ order, acceptances: [{ ...acceptance, acceptedAt: '2026-10-19T06:00:00.000Z' }], promotionId }), []);
  assert.deepEqual(attributeOrder({ order, acceptances: [], promotionId }), []);
  assert.deepEqual(attributeOrder({ order, acceptances: [acceptance], promotionId: null }), []);
});

test('el descuento cubre tantas unidades como principales; usa la aceptación más reciente', () => {
  const two = { ...order, products: [{ ...order.products[0], quantity: 2 }, order.products[1]] };
  const [row] = attributeOrder({ order: two, acceptances: [{ ...acceptance, pct: 5, acceptedAt: '2026-10-19T12:00:00.000Z' }, acceptance], promotionId });
  assert.equal(row.discount, 705.59);
  assert.equal(row.revenue, 13406.17);
  assert.equal(hasOurDiscount({ promotional_discount: { total_discount_amount: '10' } }, promotionId), true, 'sin detalle de promociones alcanza con el monto');
});

test('resumen del pedido y contadores diarios', () => {
  assert.deepEqual(orderSummary(order), { orderId: '1501', number: '9001', createdAt: '2026-10-19T14:20:00.000Z', total: 77849.77, paid: true, cancelled: false });
  assert.equal(orderSummary({ ...order, status: 'cancelled' }).cancelled, true);
  assert.equal(dayAR('2026-10-20T02:30:00Z'), '2026-10-19', 'antes de las 3 UTC es el día anterior en Argentina');
  assert.deepEqual(daysBetween('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(sumDailyCounters([{ 'shown:r1': 3, 'accepted:r1': 1 }, { 'shown:r1': 2, 'shown:r:2': 4, otro: 9 }]),
    { r1: { shown: 5, accepted: 1 }, 'r:2': { shown: 4, accepted: 0 } });
});
