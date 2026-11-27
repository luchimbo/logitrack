import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tiendanubePickingPackages } from '../src/lib/tiendanubePicking.js';
import { groupPickingProducts } from '../src/lib/mercadoLibrePicking.js';

const row = (id, products, store = '78394') => ({ tiendanube_id: id, external_store_id: store, number: String(id), products_json: JSON.stringify(products) });

test('pedidos de Tiendanube se convierten en paquetes de picking con grupo propio', () => {
  const packages = tiendanubePickingPackages([
    row(1001, [
      { product_id: 10, variant_id: 100, name: 'Teclado MIDI (Negro)', sku: 'KB-49', quantity: 2, variant_values: ['Negro'] },
      { product_id: 11, variant_id: 110, name: { es: 'Cable USB' }, sku: '', quantity: 1, variant_values: ['2 m'] },
      { product_id: 12, name: 'Sin cantidad', quantity: 0 },
    ]),
    row(1002, [{ product_id: 10, variant_id: 100, name: 'Teclado MIDI (Negro)', sku: 'KB-49', quantity: 1 }]),
    row(1003, []),
    { tiendanube_id: 1004, products_json: '{roto' },
  ]);
  assert.equal(packages.length, 2);
  assert.ok(packages.every((pkg) => pkg.shippingMethod === 'tiendanube'));
  assert.equal(packages[0].key, JSON.stringify(['tiendanube', '78394', '1001']));
  assert.deepEqual(packages[0].products.map((p) => p.name), ['Teclado MIDI (Negro)', 'Cable USB · 2 m']);
  assert.ok(packages[0].products.every((p) => p.itemId === ''));

  const grouped = groupPickingProducts(packages);
  const keyboard = grouped.find((item) => item.sku === 'KB-49');
  assert.equal(keyboard.total_quantity, 3);
  assert.equal(keyboard.shipment_count, 2);
  assert.equal(keyboard.shipping_method, 'tiendanube');
  assert.deepEqual(keyboard.item_ids, []);
});

test('el picking, el PDF y el resumen del tablero muestran el grupo Tiendanube', () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const route = read('src/app/api/picking-list/route.js');
  assert.match(route, /tiendanubePickingPackages\(await listTiendanubePickingRows/);
  assert.match(route, /failedAccounts\.push\('Tiendanube'\)/);
  assert.match(route, /tiendanube: 0/);
  assert.match(read('src/components/PickingList.js'), /renderSection\('Tiendanube', 'tiendanube'/);
  assert.match(read('src/lib/pickingPdf.js'), /title: "Tiendanube"/);
  const store = read('src/lib/tiendanubeStore.js');
  const query = store.slice(store.indexOf('export async function listTiendanubePickingRows'));
  for (const rule of [/payment_status, ''\)\) = 'paid'/, /dispatch_status, 'to_send'\) = 'to_send'/, /NOT IN \('shipped', 'delivered'\)/, /TIENDANUBE_PICKUP_WORDS/]) {
    assert.match(query, rule);
  }
});
