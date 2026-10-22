// Opiniones de las publicaciones activas de un vendedor de Mercado Libre, asociadas al SKU del producto.
// Devuelve sólo lo necesario para que Mostrador las revise; no guarda nada.
const MAX_ITEMS = 1000, PAGE_ITEMS = 100, MULTIGET = 20, MAX_REVIEW_PAGES = 4, REVIEW_PAGE = 50;

const skuOf = (item) => {
  const attr = (item.attributes || []).find((a) => a?.id === 'SELLER_SKU');
  return String(item.seller_custom_field || attr?.value_name || '').trim().toUpperCase();
};
const clip = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

async function pool(list, size, fn) {
  const out = new Array(list.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, list.length) }, async () => {
    while (next < list.length) { const i = next++; out[i] = await fn(list[i], i); }
  }));
  return out;
}

export async function collectMeliReviews({ client, sellerId, concurrency = 6 }) {
  const ids = [];
  for (let offset = 0; offset < MAX_ITEMS; offset += PAGE_ITEMS) {
    const page = await client.searchSellerItems({ sellerId, offset, limit: PAGE_ITEMS });
    const found = page?.results || [];
    ids.push(...found);
    if (found.length < PAGE_ITEMS || ids.length >= (page?.paging?.total ?? 0)) break;
  }
  const chunks = [];
  for (let i = 0; i < ids.length; i += MULTIGET) chunks.push(ids.slice(i, i + MULTIGET));
  const items = (await pool(chunks, concurrency, (chunk) => client.getItems(chunk).catch(() => [])))
    .flat().filter((r) => r?.code === 200 && r.body).map((r) => r.body);

  const stats = { items: ids.length, withoutSku: [], errors: 0, withoutText: 0, withoutReviews: 0 };
  const withSku = items.filter((item) => {
    if (skuOf(item)) return true;
    stats.withoutSku.push(item.id); return false;
  });
  const reviews = [], seen = new Set();
  await pool(withSku, concurrency, async (item) => {
    const sku = skuOf(item);
    const read = async (catalogProductId) => {
      const all = [];
      for (let page = 0; page < MAX_REVIEW_PAGES; page++) {
        const r = await client.getItemReviews(item.id, { catalogProductId, offset: page * REVIEW_PAGE, limit: REVIEW_PAGE });
        all.push(...(r?.reviews || []));
        if ((r?.reviews || []).length < REVIEW_PAGE) break;
      }
      return all;
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
    } catch { stats.errors++; }
  });
  return { ...stats, withoutSku: stats.withoutSku.slice(0, 20), withoutSkuCount: stats.withoutSku.length, reviews };
}
