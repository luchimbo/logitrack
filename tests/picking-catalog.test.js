import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import {
    catalogSkus, createPickingCatalogRepository, fetchSellerCatalog, groupCatalogListings, matchesCatalogSearch, pickingNotesFor,
} from '../src/lib/pickingCatalog.js';
import { groupPickingProducts } from '../src/lib/mercadoLibrePicking.js';

function tempDb() {
    const directory = mkdtempSync(join(tmpdir(), 'geomodi-catalog-'));
    return createClient({ url: pathToFileURL(join(directory, 'test.db')).href });
}

const item = (item_id, title, skus = []) => ({ item_id, title, skus, status: 'active', permalink: '', thumbnail: '' });

test('lee el SKU de la publicación y de sus variantes', () => {
    assert.deepEqual(catalogSkus({
        seller_custom_field: 'mkt001',
        variations: [
            { attributes: [{ id: 'SELLER_SKU', value_name: 'ZTO115' }] },
            { seller_custom_field: 'MKT001' },
        ],
    }), ['MKT001', 'ZTO115']);
    assert.deepEqual(catalogSkus({ attributes: [{ id: 'SELLER_SKU', value_name: 'A-1' }] }), ['A-1']);
});

test('busca por palabras sin acentos y por SKU', () => {
    const entry = item('MLA1', 'Teclado Órgano Meike Mk-939 61 Teclas', ['MKT001']);
    assert.ok(matchesCatalogSearch(entry, 'organo meike'));
    assert.ok(matchesCatalogSearch(entry, 'mkt001'));
    assert.ok(matchesCatalogSearch(entry, 'MLA1'));
    assert.ok(!matchesCatalogSearch(entry, 'organo arturia'));
});

test('descarga con scan por estado y multiget de a 20', async () => {
    const scans = [];
    const client = {
        async scanSellerItems({ status, scrollId }) {
            scans.push([status, scrollId]);
            if (status === 'paused') return { results: scrollId ? [] : ['MLA30'], scroll_id: 'p1' };
            if (!scrollId) return { results: Array.from({ length: 25 }, (_, i) => `MLA${i}`), scroll_id: 's1' };
            return { results: [], scroll_id: 's1' };
        },
        async getItems(ids, attributes) {
            assert.ok(ids.length <= 20);
            assert.match(attributes, /variations/);
            if (ids.includes('MLA30')) throw Object.assign(new Error('Resource deprecated - client no longer allowed'), { status: 403 });
            return ids.map((id) => ({ code: 200, body: { id, title: `Producto ${id}`, status: 'active', thumbnail: 'http://x/a.jpg', variations: id === 'MLA3' ? [{}] : [] } }));
        },
        async getItem(id) {
            single.push(id);
            return { id, title: `Producto ${id}`, status: 'paused', variations: [{ attributes: [{ id: 'SELLER_SKU', value_name: 'v-1' }] }] };
        },
    };
    const single = [];
    const items = await fetchSellerCatalog(client, '100');
    assert.equal(items.length, 26);
    assert.deepEqual(scans, [['active', ''], ['active', 's1'], ['paused', ''], ['paused', 'p1']]);
    assert.equal(items.find((entry) => entry.item_id === 'MLA0').thumbnail, 'https://x/a.jpg');
    // Las publicaciones con variantes y las que el pedido conjunto rechaza se leen de a una.
    assert.deepEqual(single.sort(), ['MLA20', 'MLA21', 'MLA22', 'MLA23', 'MLA24', 'MLA3', 'MLA30']);
    assert.deepEqual(items.find((entry) => entry.item_id === 'MLA3').skus, ['V-1']);
});


test('agrupa las publicaciones con el mismo SKU en un solo producto', () => {
    const products = groupCatalogListings([
        { ...item('MLA1', 'Meike Mk-939 Promo', ['MKT001']), status: 'paused' },
        item('MLA2', 'Teclado Órgano Meike Mk-939', ['mkt001'.toUpperCase()]),
        { ...item('MLA3', 'Pausado sin SKU', []), status: 'paused' },
    ], new Map([['sku:MKT001', 'Fuente A']]));
    assert.deepEqual(products.map((p) => [p.key, p.title, p.item_ids, p.active, p.note]), [
        ['sku:MKT001', 'Teclado Órgano Meike Mk-939', ['MLA2', 'MLA1'], true, 'Fuente A'],
        ['MLA3', 'Pausado sin SKU', ['MLA3'], false, ''],
    ]);
    assert.ok(matchesCatalogSearch(products[0], 'MLA1'));
});

test('la carga inicial pone fuentes por producto sin pisar textos guardados ni quitados', async () => {
    const db = tempDb();
    const catalog = createPickingCatalogRepository(db);
    try {
        const items = [
            item('MLA1', 'Teclado Musical Meike Mk-4100', ['MKT015']),
            { ...item('MLA5', 'Teclado Musical Meike Mk-4100 Promo', ['MKT015']), status: 'paused' },
            item('MLA2', 'Teclado Órgano Meike Mk-939', ['MKT001']),
            item('MLA3', 'Arturia MiniBrute', []),
            item('MLA4', 'Cable Midi Midiplus', ['FZC018']),
        ];
        await catalog.replaceConnection(1, 7, items.slice(2, 4), 't0');
        await catalog.setNotes(1, ['sku:MKT001'], 'Fuente propia', 'ana');
        await catalog.setNotes(1, ['MLA3'], '   ', 'ana');

        const result = await catalog.replaceConnection(1, 7, items, 't1');
        assert.deepEqual(result, { items: 5, products: 4, seeded: 1 });
        const notes = Object.fromEntries((await catalog.list(1)).map((row) => [row.key, row.note]));
        assert.deepEqual(notes, { 'sku:MKT015': 'Fuente 9V 500 mA · 5.5×2.1 mm', 'sku:MKT001': 'Fuente propia', MLA3: '', 'sku:FZC018': '' });

        // Lo que ya no está en la cuenta se borra del catálogo; el texto queda guardado.
        await catalog.replaceConnection(1, 7, [items[0]], 't2');
        assert.deepEqual((await catalog.list(1)).map((row) => row.key), ['sku:MKT015']);
        assert.equal((await catalog.list(2)).length, 0);
        await assert.rejects(catalog.setNotes(1, ['sku:MKT001'], 'x'), /no está en el catálogo/);
    } finally {
        db.close();
    }
});

test('pasa al SKU el texto que la primera versión guardó por publicación', async () => {
    const db = tempDb();
    const catalog = createPickingCatalogRepository(db);
    try {
        await db.execute("CREATE TABLE IF NOT EXISTS picking_notes (workspace_id INTEGER NOT NULL, item_id TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', updated_by TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (workspace_id, item_id))");
        await db.execute("INSERT INTO picking_notes (workspace_id, item_id, note) VALUES (1, 'MLA9', 'Con atril')");
        await catalog.replaceConnection(1, 7, [item('MLA9', 'Meike Mk-939', ['MKT001']), item('MLA8', 'Meike Mk-939 B', ['MKT001'])], 't0');
        const [product] = await catalog.list(1);
        assert.equal(product.note, 'Con atril');
        const saved = await db.execute("SELECT note FROM picking_notes WHERE item_id = 'sku:MKT001'");
        assert.equal(saved.rows[0].note, 'Con atril');
    } finally {
        db.close();
    }
});

test('el picking toma el texto del producto y usa las reglas si no hay ninguno guardado', async () => {
    const product = (itemId, quantity, sku = 'MKT001') => ({ key: JSON.stringify([itemId, '']), itemId, name: 'Meike Mk-939', sku, color: '', quantity });
    const [grouped] = groupPickingProducts([
        { key: 'a', shippingMethod: 'colecta', products: [product('MLA1', 1)] },
        { key: 'b', shippingMethod: 'colecta', products: [product('MLA2', 2)] },
    ]);
    assert.deepEqual(grouped.item_ids, ['MLA1', 'MLA2']);
    assert.deepEqual(pickingNotesFor(grouped, new Map()), ['Fuente 12V 500 mA · 5.5×2.1 mm']);
    assert.deepEqual(pickingNotesFor(grouped, new Map([['sku:MKT001', 'Fuente A'], ['MLA2', 'Vieja']])), ['Fuente A']);
    assert.deepEqual(pickingNotesFor(grouped, new Map([['sku:MKT001', '']])), []);

    const db = tempDb();
    const catalog = createPickingCatalogRepository(db);
    try {
        // Una publicación nueva del mismo SKU, que todavía no está en el catálogo, recibe el texto igual.
        await catalog.replaceConnection(1, 7, [item('MLA1', 'X', ['MKT001'])], 't0');
        await catalog.setNotes(1, ['sku:MKT001'], 'Cable interlock\nCon atril', 'ana');
        const [other] = groupPickingProducts([{ key: 'c', shippingMethod: 'flex', products: [product('MLA77', 1)] }]);
        const [sinSku] = groupPickingProducts([{ key: 'd', shippingMethod: 'flex', products: [product('MLA1', 1, '')] }]);
        const decorated = await catalog.decorate(1, [grouped, other, sinSku]);
        assert.deepEqual(decorated.map((entry) => entry.notes), [['Cable interlock\nCon atril'], ['Cable interlock\nCon atril'], ['Cable interlock\nCon atril']]);
    } finally {
        db.close();
    }
});
