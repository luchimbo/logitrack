import { snapshotRevision } from '../crossselling/engine/publish-protocol.js';
import { validateReviewsSnapshot } from '../crossselling/engine/reviews.js';
import { isStorefrontStore } from '../crossselling/stores.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });
const MAX_SKUS = 30, MAX_REVIEWS = 50, CACHE_MS = 60_000;

export function createReviewsService({ repository, now = () => Date.now() }) {
  const cache = new Map();
  async function current(storeId) {
    const hit = cache.get(storeId);
    if (hit && now() - hit.at < CACHE_MS) return hit.row;
    const row = await repository.get(storeId);
    cache.set(storeId, { at: now(), row });
    return row;
  }
  async function publish(storeId, input) {
    if (!isStorefrontStore(storeId)) throw httpError(400, 'Tienda no habilitada');
    const snapshot = validateReviewsSnapshot(input?.snapshot);
    if (snapshot.storeId !== String(storeId)) throw httpError(400, 'La publicación es de otra tienda');
    const revision = snapshotRevision(snapshot);
    if (input.revision !== revision) throw httpError(400, 'La versión no coincide con el contenido');
    const saved = await repository.save({ storeId, revision, snapshot, publishedAt: new Date(now()).toISOString() });
    cache.delete(String(storeId));
    return summary(saved);
  }
  const summary = (row) => row ? { revision: row.revision, publishedAt: row.publishedAt, enabled: row.snapshot.enabled,
    products: Object.keys(row.snapshot.products).length,
    reviews: Object.values(row.snapshot.products).reduce((n, p) => n + p.count, 0) } : { revision: null, enabled: false, products: 0, reviews: 0 };
  async function status(storeId) {
    if (!isStorefrontStore(storeId)) throw httpError(400, 'Tienda no habilitada');
    return summary(await repository.get(storeId));
  }
  // Variantes de un mismo producto: se juntan las opiniones de todos sus SKU.
  async function forStorefront(storeId, skus) {
    const row = await current(String(storeId));
    if (!row?.snapshot.enabled) return { enabled: false, count: 0, avg: 0, reviews: [] };
    const found = [...new Set(skus.map((s) => String(s).trim().toUpperCase()))].slice(0, MAX_SKUS)
      .map((s) => row.snapshot.products[s]).filter(Boolean);
    const count = found.reduce((n, p) => n + p.count, 0);
    if (!count) return { enabled: true, count: 0, avg: 0, reviews: [] };
    const avg = Math.round((found.reduce((sum, p) => sum + p.avg * p.count, 0) / count) * 10) / 10;
    const reviews = found.flatMap((p) => p.reviews).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, MAX_REVIEWS);
    return { enabled: true, count, avg, reviews };
  }
  return { publish, status, forStorefront };
}
