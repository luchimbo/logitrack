import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { groupPickingProducts, listMercadoLibrePickingPackages } from '../src/lib/mercadoLibrePicking.js';
import { createPickingExportRepository } from '../src/lib/pickingExports.js';

test('Picking pagina por cuenta y toma cantidades del paquete de Mercado Libre', async () => {
    const products = [{ item: { id: 'MLA1', variation_id: 21, title: 'Cable', seller_sku: 'C-1', variation_attributes: [{ id: 'COLOR', value_name: 'Negro' }] } }];
    const details = {
        '12': { status: 'ready_to_ship', substatus: 'printed', logistic: { type: 'cross_docking' } },
        '13': { status: 'ready_to_ship', substatus: 'picked_up' },
        '14': { status: 'handling', logistic: { type: 'fulfillment' } },
        '15': { status: 'ready_to_ship', substatus: 'buffered', logistic: { type: 'self_service' } },
        '16': { status: 'handling', logistic: { type: 'self_service' } },
    };
    const searched = [];
    const inspected = [];
    const client = {
        async searchOrders({ sellerId, shippingStatus, offset }) {
            searched.push([sellerId, shippingStatus, offset]);
            if (shippingStatus === 'handling') return { results: [{ id: 3, shipping: { id: 12 }, order_items: products }] };
            const ids = offset === 0 ? [12, 12, 13] : [14, 15, 16];
            return {
                paging: { total: 6 },
                results: ids.map((id, i) => ({ id: 10 + offset + i, shipping: { id }, order_items: products })),
            };
        },
        async getShipment(id) {
            inspected.push(id);
            return details[id];
        },
        async getShipmentItems(id) {
            assert.ok(['12', '16'].includes(id));
            return [{ item_id: 'MLA1', variation_id: 21, quantity: 2 }];
        },
    };

    const first = await listMercadoLibrePickingPackages(client, '100');
    const second = await listMercadoLibrePickingPackages(client, '200');
    assert.deepEqual(searched.map(([seller, , offset]) => [seller, offset]), [['100', 0], ['100', 0], ['100', 3], ['200', 0], ['200', 0], ['200', 3]]);
    assert.equal(inspected.filter((id) => id === '12').length, 2);
    assert.equal(new Set([...first, ...second].map((shipment) => shipment.key)).size, 4);
    assert.deepEqual(groupPickingProducts([...first, ...second]).map((item) => [
        item.shipping_method, item.total_quantity, item.shipment_count, item.sku, item.color,
    ]), [['colecta', 4, 2, 'C-1', 'Negro'], ['flex', 4, 2, 'C-1', 'Negro']]);
});

test('las exportaciones guardan una copia y solo incluyen paquetes nuevos del espacio', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'geomodi-picking-'));
    const db = createClient({ url: pathToFileURL(join(directory, 'test.db')).href });
    const exports = createPickingExportRepository(db);
    const product = { key: 'MLA1', name: 'Cable', sku: '', color: '', quantity: 2 };
    const initial = { key: 'account-a:123', shippingMethod: 'colecta', products: [product] };
    const incoming = { ...initial, key: 'account-b:123', products: [{ ...product, quantity: 1 }] };
    try {
        const first = await exports.save(1, [initial]);
        assert.equal(first.lastExport.supplemental, false);
        assert.equal(first.lastExport.items[0].total_quantity, 2);
        assert.deepEqual((await exports.read(1, [initial, incoming])).pending, [incoming]);
        assert.equal((await exports.save(1, [initial])).created, false);

        const extra = await exports.save(1, [initial, incoming]);
        assert.equal(extra.lastExport.supplemental, true);
        assert.equal(extra.lastExport.packageCount, 1);
        assert.equal(extra.lastExport.items[0].total_quantity, 1);
        assert.deepEqual(await exports.read(1, [initial, incoming]), { lastExport: extra.lastExport, pending: [] });
        assert.deepEqual(await exports.read(2, [initial]), { lastExport: null, pending: [initial] });
    } finally {
        db.close();
    }
});
