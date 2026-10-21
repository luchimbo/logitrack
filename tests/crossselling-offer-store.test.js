import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfferStore, offerStoreConfig } from '../src/lib/crossselling/offer-store.js';
import { offerCommands } from '../src/lib/crossselling/storefront-offer.js';

const now = Date.parse('2026-10-19T12:00:00Z');
const acceptance = { cartId: '2098181915', triggerVariant: '1503397959', accessoryVariant: '1503396379', pct: 10, minPriceCents: 3625280, expiresAt: now + 3600_000 };

function fakeRedis() {
  const data = new Map(), calls = [];
  const run = ([cmd, key, ...args]) => {
    if (cmd === 'HSET') { const h = data.get(key) || new Map(); h.set(args[0], args[1]); data.set(key, h); return 1; }
    if (cmd === 'HGETALL') return [...(data.get(key) || new Map())].flat();
    if (cmd === 'EXPIRE') return 1;
    if (cmd === 'SET') { data.set(key, args[0]); return 'OK'; }
    if (cmd === 'GET') return data.get(key) ?? null;
    return { error: 'unknown' };
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, auth: options.headers.Authorization, commands: JSON.parse(options.body), signal: options.signal });
    return { ok: true, json: async () => JSON.parse(options.body).map((c) => ({ result: run(c) })) };
  };
  return { data, calls, fetchImpl };
}

test('configuración: variables del Marketplace de Vercel o de Upstash; sin ellas, modo URL', () => {
  assert.deepEqual(offerStoreConfig({ KV_REST_API_URL: 'https://x.upstash.io/', KV_REST_API_TOKEN: 't' }), { url: 'https://x.upstash.io', token: 't' });
  assert.deepEqual(offerStoreConfig({ UPSTASH_REDIS_REST_URL: 'https://y.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'u' }), { url: 'https://y.upstash.io', token: 'u' });
  assert.equal(offerStoreConfig({}), null);
});

test('aceptaciones por carrito: guarda con vencimiento, filtra vencidas y otros carritos', async () => {
  const redis = fakeRedis();
  const store = createOfferStore({ url: 'https://x.upstash.io', token: 'secret', storeId: '7570182', fetchImpl: redis.fetchImpl });
  await store.saveAcceptance(acceptance);
  await store.saveAcceptance({ ...acceptance, accessoryVariant: '1503393529', expiresAt: now - 1 });
  assert.deepEqual(redis.calls[0].commands, [['HSET', 'cs:offer:7570182:acc:2098181915', '1503396379', JSON.stringify(acceptance)], ['EXPIRE', 'cs:offer:7570182:acc:2098181915', '7200']]);
  assert.equal(redis.calls[0].auth, 'Bearer secret');
  assert.deepEqual(await store.acceptances('2098181915', { now }), [acceptance]);
  assert.deepEqual(await store.acceptances('1', { now }), []);
  assert.ok(redis.calls.at(-1).signal, 'la lectura del callback tiene límite de tiempo');
  await assert.rejects(store.acceptances('x'), /Carrito inválido/);
});

test('el callback con aceptaciones de Redis aplica el mismo descuento que el modo URL', async () => {
  const redis = fakeRedis();
  const store = createOfferStore({ url: 'https://x.upstash.io', token: 't', storeId: '7570182', fetchImpl: redis.fetchImpl });
  await store.saveAcceptance(acceptance);
  const cart = { store_id: '7570182', cart_id: '2098181915', execution_tier: 'line_item', currency: 'ARS', products: [
    { id: 3615848955, variant_id: 1503396379, quantity: 1, price: '36252.80' }, { id: 3615848457, variant_id: 1503397959, quantity: 1, price: '162985.80' }] };
  const state = { promotionId: 'cd9be1bb-4133-4f95-9719-0c172b10b2ae', acceptances: await store.acceptances(cart.cart_id, { now }) };
  assert.deepEqual(offerCommands(state, cart, now)[0].specs.line_items, [{ line_item: '3615848955', discount_specs: { type: 'fixed', amount: '3625.28' } }]);
});

test('eventos del callback: último carrito por ID; errores de Redis no se ocultan', async () => {
  const redis = fakeRedis();
  const store = createOfferStore({ url: 'https://x.upstash.io', token: 't', storeId: '7570182', fetchImpl: redis.fetchImpl });
  await store.saveEvent('2098181915', { products: [{ id: 1, variantId: 2, quantity: 1, price: '10.00' }] });
  assert.equal((await store.lastEvent('2098181915')).products[0].variantId, 2);
  assert.equal(await store.lastEvent('3'), null);
  const failing = createOfferStore({ url: 'https://x.upstash.io', token: 't', storeId: '7570182', fetchImpl: async () => ({ ok: false, status: 401 }) });
  await assert.rejects(failing.acceptances('1'), /Redis HTTP 401/);
});
