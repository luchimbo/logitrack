import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, mapOnlineCatalog } from '../src/lib/crossselling/engine/online-crossselling.js';
import { addAcceptance, buildAcceptance, createOfferSigner, MAX_ACCEPTANCES, offerCommands, storefrontOffers } from '../src/lib/crossselling/storefront-offer.js';

const now = Date.parse('2026-10-16T12:00:00Z');
const settings = { maxSugerencias: 3, descuentoMaximoPct: 25, margenMinimoPct: 10 };
const products = [
  { id: 'k', codigo: 'ZTT043', nombre: 'Teclado AK490', rubro: 'Teclados', precioFinal: 162985.8, costo: 90000, iva: 21, stock: 3 },
  { id: 'm', codigo: 'MIDI1', nombre: 'Midilink Mini', rubro: 'Interfaces', precioFinal: 30673.2, costo: 10000, iva: 21, stock: 5 },
  { id: 'c', codigo: 'CARO', nombre: 'Accesorio sin margen', rubro: 'Interfaces', precioFinal: 1210, costo: 990, iva: 21, stock: 5 },
];
const rules = [{ id: 'r1', nombre: 'Teclados', activa: true, disparador: { tipo: 'rubro', valor: 'Teclados' }, sugeridos: ['m', 'c'], descuentoPct: 10 }];
const snapshot = buildSnapshot({ storeId: '7570182', products, rules, settings, enabled: true, ruleIds: ['r1'], now: new Date(now) });
const tn = [
  { id: 10, name: { es: 'Teclado AK490' }, published: true, variants: [{ id: 1503397959, sku: 'ZTT043', stock_management: true, stock: 21, price: '162985.80' }] },
  { id: 11, name: { es: 'Midilink Mini' }, published: true, variants: [{ id: 1503397906, sku: 'MIDI1', stock_management: false, price: '30673.20', values: [] }] },
  { id: 12, name: { es: 'Sin margen' }, published: true, variants: [{ id: 1503397000, sku: 'CARO', stock_management: false, price: '1210' }] },
];
const catalog = mapOnlineCatalog(snapshot, tn);
const callbackCart = { products: [{ id: 3610271214, variantId: 1503397959, quantity: 1, price: '162985.80' }] };
const acceptance = { cartId: '2096317729', triggerVariant: '1503397959', accessoryVariant: '1503397906', pct: 10, minPriceCents: 3067320, expiresAt: now + 3600_000 };
const state = { promotionId: '3ad5cdaf-facf-4f1c-a074-9c3f30a56c12', acceptances: [acceptance] };
const cart = { store_id: '7570182', cart_id: '2096317729', execution_tier: 'line_item', currency: 'ARS', products: [
  { id: 3610271214, variant_id: 1503397959, quantity: 1, price: '162985.80' }, { id: 3610271300, variant_id: 1503397906, quantity: 2, price: '30673.20' },
] };

test('ofertas de la tienda: sólo con descuento, sin costos y con la línea que dispara', () => {
  const offers = storefrontOffers(snapshot, catalog, [{ variantId: '1503397959', lineId: '3610271214', quantity: 1 }], tn);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].variantId, '1503397906');
  assert.equal(offers[0].triggerLineId, '3610271214');
  assert.equal(offers[0].discountedPrice, 27605.88);
  assert.equal(JSON.stringify(offers).includes('costo'), false);
  assert.deepEqual(storefrontOffers(snapshot, catalog, [{ variantId: '1503397906', lineId: '1', quantity: 1 }]), []);
  assert.deepEqual(storefrontOffers({ ...snapshot, enabled: false }, catalog, [{ variantId: '1503397959', lineId: '3610271214', quantity: 1 }]), []);
});

test('la aceptación se valida contra el carrito del callback, no contra el navegador', () => {
  const a = buildAcceptance({ snapshot, catalog, callbackCart, cartId: '2096317729', triggerLineId: '3610271214', accessoryVariant: '1503397906', now });
  assert.deepEqual(a, { ...acceptance, expiresAt: now + 2 * 3600_000 });
  assert.throws(() => buildAcceptance({ snapshot, catalog, callbackCart, cartId: '2096317729', triggerLineId: '999', accessoryVariant: '1503397906', now }), /principal/);
  assert.throws(() => buildAcceptance({ snapshot, catalog, callbackCart, cartId: '2096317729', triggerLineId: '3610271214', accessoryVariant: '1503397000', now }), /no está disponible/);
  assert.throws(() => buildAcceptance({ snapshot, catalog, callbackCart, cartId: 'x', triggerLineId: '3610271214', accessoryVariant: '1503397906', now }), /inválidos/);
});

test('callback: descuento sólo al carrito aceptado, limitado a la cantidad del principal', () => {
  const [command] = offerCommands(state, cart, now);
  assert.equal(command.command, 'create_or_update_discount');
  assert.deepEqual(command.specs.line_items, [{ line_item: '3610271300', discount_specs: { type: 'fixed', amount: '3067.32' } }]);
  const applied = { ...cart, promotions: [{ id: state.promotionId, line_items: ['3610271300'] }] };
  for (const changed of [{ ...applied, cart_id: '1' }, { ...applied, products: applied.products.slice(1) }, { ...applied, coupons: ['X'] },
    { ...applied, products: [applied.products[0], { ...applied.products[1], price: '20000.00' }] }]) {
    assert.deepEqual(offerCommands(state, changed, now).map((c) => c.command), ['remove_discount']);
  }
  assert.deepEqual(offerCommands(state, applied, acceptance.expiresAt + 1)[0].specs.scope, 'cart');
  assert.deepEqual(offerCommands(state, { ...cart, products: cart.products.slice(1) }, now), []);
  assert.deepEqual(offerCommands(state, { ...cart, store_id: '78394' }, now), []);
  assert.deepEqual(offerCommands(state, { ...cart, execution_tier: 'cross_items' }, now), []);
});

test('URL firmada: entra en 255 caracteres y rechaza manipulación', () => {
  const signer = createOfferSigner('a'.repeat(64));
  const big = { ...acceptance, cartId: '9999999999', triggerVariant: '9999999999', accessoryVariant: '9999999999', pct: 100, minPriceCents: 999999999, expiresAt: 4102444800000 };
  const full = { ...state, acceptances: Array.from({ length: MAX_ACCEPTANCES }, () => big) };
  assert.ok(signer.encode(full).url.length <= 255, signer.encode(full).url.length);
  const { token, encoded } = signer.encode(state);
  assert.deepEqual(signer.verify(token, encoded), { storeId: '7570182', ...state, acceptances: [{ ...acceptance, expiresAt: Math.floor(acceptance.expiresAt / 1000) * 1000 }] });
  assert.equal(signer.verify(token, encoded.replace('-a-', '-z-')), null);
  assert.equal(createOfferSigner('b'.repeat(64)).verify(token, encoded), null);
  assert.equal(signer.verify(signer.encode({ ...state, acceptances: [] }).token, encoded), null);
});

test('las aceptaciones se renuevan y conservan sólo las más recientes', () => {
  let list = [];
  for (let i = 1; i <= 5; i++) list = addAcceptance(list, { ...acceptance, cartId: String(i) }, now);
  assert.deepEqual(list.map((a) => a.cartId), ['3', '4', '5']);
  list = addAcceptance(list, { ...acceptance, cartId: '4', pct: 5 }, now);
  assert.deepEqual(list.map((a) => [a.cartId, a.pct]), [['3', 10], ['5', 10], ['4', 5]]);
  assert.deepEqual(addAcceptance([{ ...acceptance, expiresAt: now - 1 }], { ...acceptance, cartId: '9' }, now).map((a) => a.cartId), ['9']);
});

test('cada tienda tiene su propia firma de callback y sus comandos sólo valen para sus carritos', () => {
  const demo = createOfferSigner('a'.repeat(64)), pcmidi = createOfferSigner('a'.repeat(64), '78394');
  const fixed = { promotionId: state.promotionId, acceptances: [] };
  assert.ok(!demo.encode(fixed).url.includes('&st='), 'la URL de la demo no cambia');
  const signed = pcmidi.encode(fixed);
  assert.ok(signed.url.endsWith('&st=78394'));
  assert.equal(demo.verify(signed.token, signed.encoded), null, 'la firma de PC MIDI no sirve como demo');
  const verified = pcmidi.verify(signed.token, signed.encoded);
  assert.equal(verified.storeId, '78394');
  const pcCart = { ...cart, store_id: 78394 };
  assert.equal(offerCommands({ ...verified, acceptances: [acceptance] }, pcCart, now)[0].command, 'create_or_update_discount');
  assert.deepEqual(offerCommands({ ...verified, acceptances: [acceptance] }, cart, now), [], 'un carrito de la demo no usa el estado de PC MIDI');
});
