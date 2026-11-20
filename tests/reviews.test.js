import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewsSnapshot, normalizeReview } from '../src/lib/crossselling/engine/reviews.js';
import { snapshotRevision } from '../src/lib/crossselling/engine/publish-protocol.js';
import { createReviewsRepository } from '../src/lib/reviews/repository.js';
import { createReviewsService } from '../src/lib/reviews/service.js';

const today = '2026-10-22';
const review = (patch) => ({ ...normalizeReview({ sku: 'A1', rating: 5, autor: 'Ana G.', texto: 'Excelente producto', fecha: '2026-09-01', origen: 'google', ...patch }, { today }), estado: 'publicada' });
const snapshot = (reviews, extra = {}) => buildReviewsSnapshot({ storeId: '78394', reviews, enabled: true, now: new Date('2026-10-22T10:00:00Z'), ...extra });
const body = (snap) => ({ snapshot: snap, revision: snapshotRevision(snap) });

// Base mínima en memoria con la misma semántica del upsert condicional.
function fakeDb() {
  const rows = new Map();
  return {
    rows,
    async batch() {},
    async execute({ sql, args }) {
      if (sql.startsWith('SELECT')) return { rows: rows.has(args[0]) ? [rows.get(args[0])] : [] };
      const [store_id, revision, generated_at, published_at, snapshot_json] = args;
      const old = rows.get(store_id);
      if (old && !(old.generated_at < generated_at)) return { rowsAffected: 0 };
      rows.set(store_id, { store_id, revision, generated_at, published_at, snapshot_json });
      return { rowsAffected: 1 };
    },
  };
}
const make = () => { const db = fakeDb(); return { db, service: createReviewsService({ repository: createReviewsRepository(db), now: () => Date.parse('2026-10-22T12:00:00Z') }) }; };

test('publica una versión válida y la tienda recibe promedio y reseñas de todas las variantes', async () => {
  const { service } = make();
  const snap = snapshot([review({}), review({ rating: 4, fecha: '2026-10-01', texto: 'Bueno, cumple' }), review({ sku: 'A2', rating: 3, texto: 'Anda bien' })]);
  const result = await service.publish('78394', body(snap));
  assert.deepEqual([result.enabled, result.products, result.reviews], [true, 2, 3]);
  const one = await service.forStorefront('78394', ['a1']);
  assert.deepEqual([one.count, one.avg, one.reviews[0].fecha], [2, 4.5, '2026-10-01']);
  const both = await service.forStorefront('78394', ['A1', 'A2', 'A1']);
  assert.deepEqual([both.count, both.avg], [3, 4]);
  assert.deepEqual(await service.forStorefront('78394', ['NOEXISTE']), { enabled: true, count: 0, avg: 0, reviews: [] });
});

test('apagado en Mostrador, la tienda no recibe ninguna reseña', async () => {
  const { service } = make();
  await service.publish('78394', body(snapshot([review({})], { enabled: false })));
  assert.deepEqual(await service.forStorefront('78394', ['A1']), { enabled: false, count: 0, avg: 0, reviews: [] });
});

test('rechaza tienda no habilitada, otra tienda, versión adulterada y contenido inválido', async () => {
  const { service } = make();
  const snap = snapshot([review({})]);
  await assert.rejects(service.publish('99999', body(snap)), /no habilitada/);
  await assert.rejects(service.publish('7570182', body(snap)), /otra tienda/);
  await assert.rejects(service.publish('78394', { snapshot: snap, revision: 'x' }), /no coincide/);
  const bad = structuredClone(snap); bad.products.A1.reviews[0].rating = 9;
  await assert.rejects(service.publish('78394', body(bad)), /inválidas/);
});

test('una publicación vieja no pisa a una nueva y repetir la misma es inocuo', async () => {
  const { service } = make();
  const newer = body(snapshot([review({})], { now: new Date('2026-10-22T11:00:00Z') }));
  const older = body(snapshot([review({ rating: 1 })], { now: new Date('2026-10-22T09:00:00Z') }));
  await service.publish('78394', newer);
  await service.publish('78394', newer);
  await assert.rejects(service.publish('78394', older), (e) => e.status === 409);
  assert.equal((await service.status('78394')).revision, newer.revision);
});

test('manda las más nuevas por producto y conserva el total', async () => {
  const { service } = make();
  const many = Array.from({ length: 60 }, (_, i) => review({ autor: `Cliente ${i}`, fecha: `2026-08-${String((i % 28) + 1).padStart(2, '0')}` }));
  await service.publish('78394', body(snapshot(many)));
  const shown = await service.forStorefront('78394', ['A1']);
  // La publicación manda las 25 más nuevas, pero el total y el promedio cuentan las 60.
  assert.deepEqual([shown.reviews.length, shown.count], [25, 60]);
});
