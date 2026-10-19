import test from 'node:test';
import assert from 'node:assert/strict';
import { demoProbeCommands } from '../src/lib/crossselling/demo-probe-commands.js';
import { createDemoProbeSigner } from '../src/lib/crossselling/demo-probe-signing.js';
const state = { promotionId: 'promo', enabled: true, expiresAt: 2000, cartId: '123', triggerVariant: '1', accessoryVariant: '2' };
const cart = { store_id: '7570182', execution_tier: 'line_item', currency: 'ARS', cart_id: '123', products: [
  { id: 5, variant_id: 1, quantity: 1, price: '10.00' }, { id: 6, variant_id: 2, quantity: 1, price: '20.00' },
] };
test('demo probe limits discount to accepted cart and removes when trigger disappears', () => {
  assert.equal(demoProbeCommands(state, cart, 1000)[0].specs.line_items[0].discount_specs.amount, '1.00');
  for (const changed of [{ ...cart, cart_id: 'other' }, { ...cart, products: cart.products.slice(1) }, { ...cart, coupons: ['x'] }]) {
    assert.equal(demoProbeCommands(state, changed, 1000)[0].command, 'remove_discount');
  }
  assert.equal(demoProbeCommands(state, cart, 3000)[0].command, 'remove_discount');
  assert.equal(demoProbeCommands({ ...state, enabled: false }, cart, 1000)[0].command, 'remove_discount');
});
test('demo probe never grants benefits to production or other execution tier', () => {
  assert.deepEqual(demoProbeCommands(state, { ...cart, store_id: '78394' }, 1000), []);
  assert.deepEqual(demoProbeCommands(state, { ...cart, execution_tier: 'cross_items' }, 1000), []);
});
test('configuración de prueba compacta rechaza manipulación, otra clave y vencimiento', () => {
  const signer = createDemoProbeSigner('a'.repeat(64));
  const probe = { ...state, promotionId: '3ad5cdaf-facf-4f1c-a074-9c3f30a56c12', expiresAt: 1792183008000 };
  const signed = signer.encode(probe);
  assert.deepEqual(signer.verify(signed.token, signed.encoded), probe);
  assert.equal(signer.verify(signed.token, signed.encoded.replace('.123.', '.456.')), null);
  assert.equal(createDemoProbeSigner('b'.repeat(64)).verify(signed.token, signed.encoded), null);
  assert.equal(signer.verify('', signed.encoded), null);
  assert.ok(`https://www.geomodi.ai/api/cross-selling/demo-callback/${signed.token}?state=${signed.encoded}`.length < 255);
  assert.equal(demoProbeCommands(signer.verify(signed.token, signed.encoded), cart, probe.expiresAt + 1)[0].command, 'remove_discount');
});
