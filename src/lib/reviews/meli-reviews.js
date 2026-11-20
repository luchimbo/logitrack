// Opiniones de las publicaciones activas de un vendedor de Mercado Libre, asociadas al SKU del producto.
// Se lee por tandas de publicaciones (offset/limit) y con reintentos: Mercado Libre limita el ritmo de pedidos.
// Devuelve sólo lo necesario para que Mostrador las revise; no guarda nada.
const MAX_ITEMS = 2000, PAGE_ITEMS = 100, MULTIGET = 20, MAX_REVIEW_PAGES = 4, REVIEW_PAGE = 50;
const RETRY_WAITS_MS = [800, 2000, 5000, 10000];

const skuOf = (item) => {
  const attr = (item.attributes || []).find((a) => a?.id === 'SELLER_SKU');
  return String(item.seller_custom_field || attr?.value_name || '').trim().toUpperCase();
};
const clip = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const tooMany = (error) => error?.status === 429 || /too many requests/i.test(error?.message || '');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry(fn, waits) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (error) {
      if (!tooMany(error) || attempt >= waits.length) throw error;
      await sleep(waits[attempt]);
    }
  }
}

async function pool(list, size, fn) {
  const out = new Array(list.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, list.length) }, async () => {
    while (next < list.length) { const i = next++; out[i] = await fn(list[i], i); }
  }));
  return out;
}

export async function listSellerItemIds({ client, sellerId, waits = RETRY_WAITS_MS }) {
  const ids = [];
  for (let offset = 0; offset < MAX_ITEMS; offset += PAGE_ITEMS) {
    const page = await withRetry(() => client.searchSellerItems({ sellerId, offset, limit: PAGE_ITEMS }), waits)
      .catch((error) => { throw new Error(`al listar las publicaciones: ${error.message}`); });
    const found = page?.results || [];
    ids.push(...found);
    if (found.length < PAGE_ITEMS || ids.length >= (page?.paging?.total ?? 0)) break;
  }
  return ids;
}

// Lee las opiniones de ids[offset, offset + limit). `nextOffset` es null cuando no quedan más.
export async function collectMeliReviews({ client, sellerId, offset = 0, limit = 150, concurrency = 3, waits = RETRY_WAITS_MS }) {
  const all = await listSellerItemIds({ client, sellerId, waits });
  const ids = all.slice(offset, offset + limit);
  const nextOffset = offset + limit < all.length ? offset + limit : null;
  const chunks = [];
  for (let i = 0; i < ids.length; i += MULTIGET) chunks.push(ids.slice(i, i + MULTIGET));
  const stats = { total: all.length, items: ids.length, nextOffset, firstError: '', withoutSku: [], errors: 0, withoutText: 0, withoutReviews: 0 };
  const fail = (error) => { stats.errors++; stats.firstError ||= String(error.message || '').slice(0, 200); };
  const items = (await pool(chunks, concurrency, (chunk) => withRetry(() => client.getItems(chunk), waits).catch((error) => { fail(error); return []; })))
    .flat().filter((r) => r?.code === 200 && r.body).map((r) => r.body);

  const withSku = items.filter((item) => {
    if (skuOf(item)) return true;
    stats.withoutSku.push(item.id); return false;
  });
  const reviews = [], seen = new Set();
  await pool(withSku, concurrency, async (item) => {
    const sku = skuOf(item);
    const read = async (catalogProductId) => {
      const found = [];
      for (let page = 0; page < MAX_REVIEW_PAGES; page++) {
        const r = await withRetry(() => client.getItemReviews(item.id, { catalogProductId, offset: page * REVIEW_PAGE, limit: REVIEW_PAGE }), waits);
        found.push(...(r?.reviews || []));
        if ((r?.reviews || []).length < REVIEW_PAGE) break;
      }
      return found;
    };
    try {
      let list = await read('');
      // Productos de catálogo: las opiniones pueden estar en el producto y no en la publicación.
      if (!list.length && item.catalog_product_id) list = await read(item.catalog_product_id);
      if (!list.length) stats.withoutReviews++;
      for (const r of list) {
        if (r.status && r.status !== 'published') continue;
        const text = clip(r.content || r.title, 1500);
        const rating = Number(r.rate);
        if (text.length < 3) { stats.withoutText++; continue; }
        const externalId = `ml:${r.id}`;
        if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !r.id || seen.has(`${externalId}|${sku}`)) continue;
        seen.add(`${externalId}|${sku}`);
        reviews.push({ externalId, sku, rating, texto: text, fecha: String(r.date_created || '').slice(0, 10),
          enlace: /^https:\/\//.test(item.permalink || '') ? item.permalink : '' });
      }
    } catch (error) { fail(error); }
  });
  return { ...stats, withoutSku: stats.withoutSku.slice(0, 20), withoutSkuCount: stats.withoutSku.length, reviews };
}
