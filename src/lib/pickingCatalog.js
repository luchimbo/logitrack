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
    const haystack = normalizeSearch(`${item.title} ${item.skus.join(' ')} ${item.item_id}`);
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

// Texto que sale en picking para un producto agrupado: lo guardado de sus publicaciones o,
// si ninguna tiene fila guardada, las reglas de fuentes.
export function pickingNotesFor(item, notesByItem) {
    const ids = item.item_ids || [];
    const saved = ids.filter((id) => notesByItem.has(id));
    if (!saved.length) return getPickingAccessories(item);
    return [...new Set(saved.map((id) => notesByItem.get(id)).filter(Boolean))];
}

export function createPickingCatalogRepository(db) {
    let schemaReady;
    function ensureSchema() {
        return schemaReady ||= db.batch(schema, 'write').catch((error) => {
            schemaReady = null;
            throw error;
        });
    }

    async function notesByItem(workspaceId, itemIds) {
        await ensureSchema();
        const ids = [...new Set(itemIds.map(String))];
        if (!ids.length) return new Map();
        const result = await db.execute({
            sql: 'SELECT item_id, note FROM picking_notes WHERE workspace_id = ? AND item_id IN (SELECT value FROM json_each(?))',
            args: [workspaceId, JSON.stringify(ids)],
        });
        return new Map(result.rows.map((row) => [String(row.item_id), String(row.note || '')]));
    }

    return {
        async list(workspaceId) {
            await ensureSchema();
            const result = await db.execute({
                sql: `SELECT c.connection_id, c.item_id, c.title, c.skus, c.status, c.permalink, c.thumbnail, c.synced_at,
                             n.note, n.updated_at AS note_updated_at
                      FROM meli_catalog_items c
                      LEFT JOIN picking_notes n ON n.workspace_id = c.workspace_id AND n.item_id = c.item_id
                      WHERE c.workspace_id = ?
                      ORDER BY c.status = 'active' DESC, c.title COLLATE NOCASE`,
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
                note: row.note == null ? '' : String(row.note),
            }));
        },

        // Reemplaza el catálogo de una cuenta y carga las fuentes donde todavía no hay texto.
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

                const existing = await transaction.execute({
                    sql: 'SELECT item_id FROM picking_notes WHERE workspace_id = ? AND item_id IN (SELECT value FROM json_each(?))',
                    args: [workspaceId, JSON.stringify(items.map((item) => item.item_id))],
                });
                const withRow = new Set(existing.rows.map((row) => String(row.item_id)));
                const seeds = items
                    .filter((item) => !withRow.has(item.item_id))
                    .map((item) => [item.item_id, getPickingAccessories({ product_name: item.title, sku: item.skus[0] || '' }).join('\n')])
                    .filter(([, note]) => note);
                for (let i = 0; i < seeds.length; i += 200) {
                    await transaction.batch(seeds.slice(i, i + 200).map(([itemId, note]) => ({
                        sql: "INSERT INTO picking_notes (workspace_id, item_id, note, updated_by) VALUES (?, ?, ?, 'carga inicial de fuentes')",
                        args: [workspaceId, itemId, note],
                    })));
                }
                await transaction.commit();
                return { items: items.length, seeded: seeds.length };
            } finally {
                transaction.close();
            }
        },

        // Aplica el mismo texto a varias publicaciones del catálogo del espacio.
        async setNotes(workspaceId, itemIds, note, updatedBy = '') {
            await ensureSchema();
            const ids = [...new Set((itemIds || []).map(String).filter(Boolean))];
            if (!ids.length) return 0;
            const known = await db.execute({
                sql: 'SELECT item_id FROM meli_catalog_items WHERE workspace_id = ? AND item_id IN (SELECT value FROM json_each(?))',
                args: [workspaceId, JSON.stringify(ids)],
            });
            const valid = known.rows.map((row) => String(row.item_id));
            if (valid.length !== ids.length) throw Object.assign(new Error('Alguna publicación no está en el catálogo'), { status: 400 });
            const text = cleanNote(note);
            await db.batch(valid.map((itemId) => ({
                sql: `INSERT INTO picking_notes (workspace_id, item_id, note, updated_by, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                      ON CONFLICT(workspace_id, item_id) DO UPDATE SET note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
                args: [workspaceId, itemId, text, String(updatedBy || '')],
            })), 'write');
            return valid.length;
        },

        notesByItem,

        // Agrega `notes` a los productos agrupados del picking.
        async decorate(workspaceId, items) {
            const map = await notesByItem(workspaceId, items.flatMap((item) => item.item_ids || []));
            return items.map((item) => ({ ...item, notes: pickingNotesFor(item, map) }));
        },
    };
}
