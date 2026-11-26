// Catálogo de publicaciones de Mercado Libre y texto extra que se muestra en picking.
// El texto se guarda por publicación (item_id). Una fila con texto vacío significa que
// alguien lo quitó a propósito: ni la carga inicial ni las reglas de fuentes lo reponen.
import { getPickingAccessories } from './pickingAccessories.js';

export const MAX_NOTE_LENGTH = 300;
const STATUSES = ['active', 'paused'];
const SCAN_LIMIT = 100;
const MULTIGET = 20;
const ITEM_FIELDS = 'id,title,permalink,thumbnail,status,seller_custom_field,attributes,variations';
const RETRY_WAITS_MS = [800, 2000, 5000, 10000];

const schema = [
    `CREATE TABLE IF NOT EXISTS meli_catalog_items (
        workspace_id INTEGER NOT NULL,
        connection_id INTEGER NOT NULL,
        item_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        skus TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        permalink TEXT NOT NULL DEFAULT '',
        thumbnail TEXT NOT NULL DEFAULT '',
        synced_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, item_id)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_meli_catalog_items_connection ON meli_catalog_items(workspace_id, connection_id)',
    `CREATE TABLE IF NOT EXISTS picking_notes (
        workspace_id INTEGER NOT NULL,
        item_id TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        updated_by TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (workspace_id, item_id)
    )`,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tooMany = (error) => error?.status === 429 || /too many requests/i.test(error?.message || '');
// Desde noviembre de 2026 Mercado Libre rechaza a veces el pedido de varias publicaciones juntas.
const multigetRefused = (error) => error?.status === 403 && /deprecated/i.test(error?.message || '');

async function withRetry(fn, waits) {
    for (let attempt = 0; ; attempt += 1) {
        try { return await fn(); }
        catch (error) {
            if (!tooMany(error) || attempt >= waits.length) throw error;
            await sleep(waits[attempt]);
        }
    }
}

function skuFrom(entity) {
    const attribute = (entity?.attributes || []).find((attr) => attr?.id === 'SELLER_SKU');
    return String(entity?.seller_custom_field || attribute?.value_name || '').trim();
}

// SKU de la publicación y de cada variante, sin repetir.
export function catalogSkus(item) {
    const skus = [skuFrom(item), ...(item?.variations || []).map(skuFrom)].filter(Boolean);
    return [...new Set(skus.map((sku) => sku.toUpperCase()))];
}

export function normalizeSearch(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

// Todas las palabras tienen que aparecer en el título, el SKU o el número de publicación.
export function matchesCatalogSearch(item, query) {
    const words = normalizeSearch(query).split(' ').filter(Boolean);
    if (!words.length) return true;
    const haystack = normalizeSearch(`${item.title} ${item.skus.join(' ')} ${(item.item_ids || [item.item_id]).join(' ')}`);
    return words.every((word) => haystack.includes(word));
}

export function cleanNote(value) {
    return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_NOTE_LENGTH);
}

// Lee las publicaciones activas y pausadas de una cuenta. Usa scan porque la búsqueda
// por offset de Mercado Libre se corta cerca de las 1000 publicaciones.
export async function fetchSellerCatalog(client, sellerId, { waits = RETRY_WAITS_MS } = {}) {
    const ids = new Set();
    for (const status of STATUSES) {
        let scrollId = '';
        for (let page = 0; page < 500; page += 1) {
            const result = await withRetry(() => client.scanSellerItems({ sellerId, status, scrollId, limit: SCAN_LIMIT }), waits);
            const found = Array.isArray(result?.results) ? result.results : [];
            found.forEach((id) => ids.add(String(id)));
            scrollId = result?.scroll_id || '';
            if (!found.length || !scrollId) break;
        }
    }

    const list = [...ids];
    const chunks = [];
    for (let i = 0; i < list.length; i += MULTIGET) chunks.push(list.slice(i, i + MULTIGET));
    const items = [];
    const readOne = (id) => withRetry(() => client.getItem(id), waits);
    const readChunk = async (chunk) => {
        let bodies;
        try {
            const response = await withRetry(() => client.getItems(chunk, ITEM_FIELDS), waits);
            bodies = (Array.isArray(response) ? response : []).map((entry) => (entry?.code === 200 ? entry.body : null));
        } catch (error) {
            if (!multigetRefused(error)) throw error;
            bodies = [];
            for (const id of chunk) bodies.push(await readOne(id));
            return bodies;
        }
        // El pedido conjunto no trae los atributos de las variantes: esas se leen de a una.
        return Promise.all(bodies.map((body) => (body?.variations?.length ? readOne(body.id) : body)));
    };
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, async () => {
        while (next < chunks.length) {
            for (const body of await readChunk(chunks[next++])) {
                if (!body?.id) continue;
                items.push({
                    item_id: String(body.id),
                    title: String(body.title || ''),
                    skus: catalogSkus(body),
                    status: String(body.status || ''),
                    permalink: String(body.permalink || ''),
                    thumbnail: String(body.thumbnail || '').replace(/^http:/, 'https:'),
                });
            }
        }
    }));
    if (items.length < list.length) {
        throw new Error(`Mercado Libre devolvió ${items.length} de ${list.length} publicaciones`);
    }
    return items;
}

// El texto se guarda por producto: publicaciones con el mismo SKU comparten texto. La clave
// es «sku:<SKU>»; una publicación sin SKU usa su número (MLA…). La columna picking_notes.item_id
// guarda esa clave (las filas de la primera versión tienen el número de publicación).
export function productKey(sku, itemId) {
    const value = String(sku || '').trim().toUpperCase();
    return value ? `sku:${value}` : String(itemId || '');
}

const listingKey = (listing) => productKey(listing.skus[0], listing.item_id);

// Junta las publicaciones de un mismo producto. Los productos con alguna publicación activa van primero.
export function groupCatalogListings(listings, notes = new Map()) {
    const products = new Map();
    for (const listing of listings) {
        const key = listingKey(listing);
        if (!products.has(key)) products.set(key, []);
        products.get(key).push(listing);
    }
    return [...products].map(([key, group]) => {
        const ordered = [...group].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'));
        // Texto del producto o, si no tiene, el de alguna publicación (primera versión del catálogo).
        const legacy = ordered.map((listing) => notes.get(listing.item_id)).find((note) => note != null);
        const note = notes.has(key) ? notes.get(key) : legacy;
        return {
            key,
            title: ordered[0].title,
            thumbnail: ordered.find((listing) => listing.thumbnail)?.thumbnail || '',
            skus: [...new Set(ordered.flatMap((listing) => listing.skus))],
            item_ids: ordered.map((listing) => listing.item_id),
            active: ordered.some((listing) => listing.status === 'active'),
            listings: ordered.map(({ item_id, status, permalink, connection_id }) => ({ item_id, status, permalink, connection_id })),
            note: note == null ? '' : note,
            hasSavedNote: note != null,
            synced_at: ordered.reduce((latest, listing) => (listing.synced_at > latest ? listing.synced_at : latest), ''),
        };
    }).sort((a, b) => Number(b.active) - Number(a.active) || a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));
}

// Texto que sale en picking para un producto agrupado. Busca por su SKU, por el producto de cada
// publicación en el catálogo y por la publicación; si nada tiene fila guardada, usa las reglas.
export function pickingNotesFor(item, notesByKey, keyByItem = new Map()) {
    const ids = item.item_ids || [];
    const keys = [...new Set([
        ...(item.sku ? [productKey(item.sku)] : []),
        ...ids.map((id) => keyByItem.get(id)).filter(Boolean),
        ...ids,
    ])];
    const saved = keys.find((key) => notesByKey.has(key));
    if (!saved) return getPickingAccessories(item);
    // La clave más específica gana: un texto quitado del producto no se completa con uno viejo.
    const note = notesByKey.get(saved);
    return note ? [note] : [];
}

export function createPickingCatalogRepository(db) {
    let schemaReady;
    function ensureSchema() {
        return schemaReady ||= db.batch(schema, 'write').catch((error) => {
            schemaReady = null;
            throw error;
        });
    }

    async function listings(workspaceId, executor = db) {
        const result = await executor.execute({
            sql: 'SELECT connection_id, item_id, title, skus, status, permalink, thumbnail, synced_at FROM meli_catalog_items WHERE workspace_id = ?',
            args: [workspaceId],
        });
        return result.rows.map((row) => ({
            connection_id: Number(row.connection_id),
            item_id: String(row.item_id),
            title: String(row.title || ''),
            skus: String(row.skus || '').split(' ').filter(Boolean),
            status: String(row.status || ''),
            permalink: String(row.permalink || ''),
            thumbnail: String(row.thumbnail || ''),
            synced_at: String(row.synced_at || ''),
        }));
    }

    async function notesFor(workspaceId, keys, executor = db) {
        const unique = [...new Set(keys.map(String).filter(Boolean))];
        if (!unique.length) return new Map();
        const result = await executor.execute({
            sql: 'SELECT item_id, note FROM picking_notes WHERE workspace_id = ? AND item_id IN (SELECT value FROM json_each(?))',
            args: [workspaceId, JSON.stringify(unique)],
        });
        return new Map(result.rows.map((row) => [String(row.item_id), String(row.note || '')]));
    }

    const keysOf = (list) => list.flatMap((listing) => [listingKey(listing), listing.item_id]);

    return {
        async list(workspaceId) {
            await ensureSchema();
            const all = await listings(workspaceId);
            return groupCatalogListings(all, await notesFor(workspaceId, keysOf(all)));
        },

        // Reemplaza el catálogo de una cuenta y carga las fuentes donde el producto todavía no tiene texto.
        async replaceConnection(workspaceId, connectionId, items, syncedAt = new Date().toISOString()) {
            await ensureSchema();
            const transaction = await db.transaction('write');
            try {
                for (let i = 0; i < items.length; i += 200) {
                    await transaction.batch(items.slice(i, i + 200).map((item) => ({
                        sql: `INSERT INTO meli_catalog_items (workspace_id, connection_id, item_id, title, skus, status, permalink, thumbnail, synced_at)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                              ON CONFLICT(workspace_id, item_id) DO UPDATE SET connection_id = excluded.connection_id, title = excluded.title,
                                skus = excluded.skus, status = excluded.status, permalink = excluded.permalink,
                                thumbnail = excluded.thumbnail, synced_at = excluded.synced_at`,
                        args: [workspaceId, connectionId, item.item_id, item.title, item.skus.join(' '), item.status, item.permalink, item.thumbnail, syncedAt],
                    })));
                }
                await transaction.execute({
                    sql: 'DELETE FROM meli_catalog_items WHERE workspace_id = ? AND connection_id = ? AND synced_at <> ?',
                    args: [workspaceId, connectionId, syncedAt],
                });

                // Cada producto sin fila propia recibe el texto de alguna de sus publicaciones
                // (primera versión del catálogo) o, si no hay ninguno, las fuentes conocidas.
                const products = groupCatalogListings(items, await notesFor(workspaceId, keysOf(items), transaction));
                const writes = [];
                let seeded = 0;
                const existing = await notesFor(workspaceId, products.map((product) => product.key), transaction);
                for (const product of products) {
                    if (existing.has(product.key)) continue;
                    if (product.hasSavedNote) {
                        writes.push([product.key, product.note, 'primera versión del catálogo']);
                        continue;
                    }
                    const rule = getPickingAccessories({ product_name: product.title, sku: product.skus[0] || '' }).join('\n');
                    if (!rule) continue;
                    writes.push([product.key, rule, 'carga inicial de fuentes']);
                    seeded += 1;
                }
                for (let i = 0; i < writes.length; i += 200) {
                    await transaction.batch(writes.slice(i, i + 200).map(([key, note, by]) => ({
                        sql: 'INSERT INTO picking_notes (workspace_id, item_id, note, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id, item_id) DO NOTHING',
                        args: [workspaceId, key, note, by],
                    })));
                }
                await transaction.commit();
                return { items: items.length, products: products.length, seeded };
            } finally {
                transaction.close();
            }
        },

        // Aplica el mismo texto a varios productos del catálogo del espacio.
        async setNotes(workspaceId, keys, note, updatedBy = '') {
            await ensureSchema();
            const wanted = [...new Set((keys || []).map(String).filter(Boolean))];
            if (!wanted.length) return 0;
            const known = new Set((await listings(workspaceId)).map(listingKey));
            if (wanted.some((key) => !known.has(key))) throw Object.assign(new Error('Algún producto no está en el catálogo'), { status: 400 });
            const text = cleanNote(note);
            await db.batch(wanted.map((key) => ({
                sql: `INSERT INTO picking_notes (workspace_id, item_id, note, updated_by, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                      ON CONFLICT(workspace_id, item_id) DO UPDATE SET note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
                args: [workspaceId, key, text, String(updatedBy || '')],
            })), 'write');
            return wanted.length;
        },

        // Agrega `notes` a los productos agrupados del picking.
        async decorate(workspaceId, items) {
            await ensureSchema();
            const ids = [...new Set(items.flatMap((item) => item.item_ids || []))];
            const catalog = ids.length ? await db.execute({
                sql: 'SELECT item_id, skus FROM meli_catalog_items WHERE workspace_id = ? AND item_id IN (SELECT value FROM json_each(?))',
                args: [workspaceId, JSON.stringify(ids)],
            }) : { rows: [] };
            const keyByItem = new Map(catalog.rows.map((row) => [String(row.item_id), productKey(String(row.skus || '').split(' ')[0], row.item_id)]));
            const keys = [...items.filter((item) => item.sku).map((item) => productKey(item.sku)), ...keyByItem.values(), ...ids];
            const notes = await notesFor(workspaceId, keys);
            return items.map((item) => ({ ...item, notes: pickingNotesFor(item, notes, keyByItem) }));
        },
    };
}
