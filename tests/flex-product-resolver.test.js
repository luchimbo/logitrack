import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFlexProductMetadata, isGenericFlexProductName, resolveFlexProductsFromOrderRows } from '../src/lib/flexProductMetadata.js';

test('Flex metadata replaces Unidad with one Mercado Libre item', () => {
  const metadata = buildFlexProductMetadata([{ name: 'Cable USB-C', sku: 'CAB-01', quantity: 1 }]);
  assert.deepEqual(metadata, { product_name: 'Cable USB-C ×1', sku: 'CAB-01 ×1', quantity: 1 });
  assert.equal(isGenericFlexProductName(' Unidad '), true);
});

test('Flex metadata preserves all products of one Mercado Libre package', () => {
  const { resolved } = resolveFlexProductsFromOrderRows(
    [{ id: 8, tracking_number: 'TRACK-1', product_name: 'Unidad' }],
    [
      { shipment_id: 'ML-1', tracking_number: 'TRACK-1', products_json: JSON.stringify([{ name: 'Producto A', sku: 'A-1', quantity: 1 }]) },
      { shipment_id: 'ML-1', tracking_number: 'TRACK-1', products_json: JSON.stringify([{ name: 'Producto B', sku: 'B-2', quantity: 2 }]) },
    ],
  );
  assert.deepEqual(resolved.get('TRACK-1'), { product_name: 'Producto A ×1 · Producto B ×2', sku: 'A-1 ×1 · B-2 ×2', quantity: 3 });
});

test('Flex resolver rejects an ambiguous tracking match', () => {
  const { resolved, unresolved } = resolveFlexProductsFromOrderRows(
    [{ id: 9, tracking_number: 'TRACK-2', product_name: 'Unidad' }],
    [
      { shipment_id: 'ML-1', tracking_number: 'TRACK-2', products_json: JSON.stringify([{ name: 'Uno', quantity: 1 }]) },
      { shipment_id: 'ML-2', tracking_number: 'TRACK-2', products_json: JSON.stringify([{ name: 'Dos', quantity: 1 }]) },
    ],
  );
  assert.equal(resolved.size, 0);
  assert.deepEqual(unresolved, [9]);
});
