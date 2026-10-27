import test from 'node:test';
import assert from 'node:assert/strict';
import { collectMeliReviews } from '../src/lib/reviews/meli-reviews.js';

const item = (id, patch = {}) => ({ code: 200, body: { id, permalink: `https://articulo.mercadolibre.com.ar/${id}`, seller_custom_field: `sku-${id}`, attributes: [], ...patch } });
const review = (id, rate, content, patch = {}) => ({ id, rate, content, title: '', status: 'published', date_created: '2026-09-10T12:00:00.000Z', ...patch });

function fakeClient({ items, reviews }) {
  const calls = [];
  return { calls,
    async searchSellerItems({ offset }) { return { results: items.map((i) => i.body.id).slice(offset, offset + 100), paging: { total: items.length } }; },
    async getItems(ids) { return items.filter((i) => ids.includes(i.body.id)); },
    async getItemReviews(id, opts) { calls.push([id, opts.catalogProductId || '']); const r = reviews[`${id}${opts.catalogProductId ? ':c' : ''}`] || []; return { reviews: r.slice(opts.offset, opts.offset + opts.limit) }; } };
}

test('asocia las opiniones al SKU de la publicación y arma el link de origen', async () => {
  const client = fakeClient({ items: [item('MLA1'), item('MLA2', { seller_custom_field: '', attributes: [{ id: 'SELLER_SKU', value_name: ' zto115 ' }] })],
    reviews: { MLA1: [review(1, 5, 'Excelente producto')], MLA2: [review(2, 4, 'Muy bueno', { title: 'Bueno' })] } });
  const out = await collectMeliReviews({ client, sellerId: '1' });
  assert.deepEqual(out.reviews.map((r) => [r.externalId, r.sku, r.rating, r.fecha]), [['ml:1', 'SKU-MLA1', 5, '2026-09-10'], ['ml:2', 'ZTO115', 4, '2026-09-10']]);
  assert.equal(out.reviews[0].enlace, 'https://articulo.mercadolibre.com.ar/MLA1');
});

test('omite publicaciones sin SKU, opiniones sin texto, no publicadas o con calificación inválida y las cuenta', async () => {
  const client = fakeClient({ items: [item('MLA1'), item('MLA3', { seller_custom_field: '' })],
    reviews: { MLA1: [review(1, 5, ''), review(2, 5, 'ok bien'), review(3, 3, 'Hidden one', { status: 'hidden' }), review(4, 9, 'Rating roto'), review(5, 2, 'Regular nomás')] } });
  const out = await collectMeliReviews({ client, sellerId: '1' });
  assert.deepEqual(out.reviews.map((r) => r.externalId), ['ml:2', 'ml:5']);
  assert.equal(out.withoutText, 1);
  assert.deepEqual([out.withoutSkuCount, out.withoutSku], [1, ['MLA3']]);
});

test('si la publicación no tiene opiniones busca las del producto de catálogo', async () => {
  const client = fakeClient({ items: [item('MLA1', { catalog_product_id: 'MLA99' })], reviews: { 'MLA1:c': [review(7, 5, 'Opinión del catálogo')] } });
  const out = await collectMeliReviews({ client, sellerId: '1' });
  assert.equal(out.reviews.length, 1);
  assert.deepEqual(client.calls, [['MLA1', ''], ['MLA1', 'MLA99']]);
});

test('un error en una publicación no corta el resto y queda contado', async () => {
  const client = fakeClient({ items: [item('MLA1'), item('MLA2')], reviews: { MLA2: [review(2, 5, 'Llegó perfecto')] } });
  const original = client.getItemReviews;
  client.getItemReviews = async (id, o) => { if (id === 'MLA1') throw new Error('boom'); return original(id, o); };
  const out = await collectMeliReviews({ client, sellerId: '1' });
  assert.equal(out.errors, 1);
  assert.deepEqual(out.reviews.map((r) => r.sku), ['SKU-MLA2']);
});

test('indica en qué paso falla Mercado Libre y conserva el primer error de opiniones', async () => {
  const denied = fakeClient({ items: [item('MLA1')], reviews: {} });
  denied.searchSellerItems = async () => { throw new Error('At least one policy returned UNAUTHORIZED.'); };
  await assert.rejects(collectMeliReviews({ client: denied, sellerId: '1' }), /al listar las publicaciones: At least one policy returned UNAUTHORIZED/);
  const noReviews = fakeClient({ items: [item('MLA1')], reviews: {} });
  noReviews.getItemReviews = async () => { throw new Error('policy UNAUTHORIZED'); };
  const out = await collectMeliReviews({ client: noReviews, sellerId: '1' });
  assert.deepEqual([out.errors, out.firstError], [1, 'policy UNAUTHORIZED']);
});

test('reintenta cuando Mercado Libre limita el ritmo y termina trayendo las opiniones', async () => {
  const client = fakeClient({ items: [item('MLA1')], reviews: { MLA1: [review(1, 5, 'Excelente producto')] } });
  const original = client.getItemReviews; let attempts = 0;
  client.getItemReviews = async (id, o) => { if (attempts++ < 2) throw Object.assign(new Error('too many requests'), { status: 429 }); return original(id, o); };
  const out = await collectMeliReviews({ client, sellerId: '1', waits: [0, 0, 0] });
  assert.deepEqual([out.reviews.length, out.errors, attempts], [1, 0, 3]);
  // Sin reintentos disponibles el error queda contado en lugar de perderse en silencio.
  attempts = 0;
  const limited = await collectMeliReviews({ client, sellerId: '1', waits: [] });
  assert.deepEqual([limited.reviews.length, limited.errors, limited.firstError], [0, 1, 'too many requests']);
});

test('lee las publicaciones por tandas e informa dónde seguir', async () => {
  const items = Array.from({ length: 5 }, (_, i) => item(`MLA${i + 1}`));
  const reviews = Object.fromEntries(items.map((i, n) => [i.body.id, [review(n + 1, 5, `Opinión número ${n + 1}`)]]));
  const client = fakeClient({ items, reviews });
  const first = await collectMeliReviews({ client, sellerId: '1', offset: 0, limit: 2 });
  assert.deepEqual([first.total, first.items, first.nextOffset, first.reviews.map((r) => r.externalId)], [5, 2, 2, ['ml:1', 'ml:2']]);
  const last = await collectMeliReviews({ client, sellerId: '1', offset: 4, limit: 2 });
  assert.deepEqual([last.items, last.nextOffset, last.reviews.map((r) => r.externalId)], [1, null, ['ml:5']]);
});
