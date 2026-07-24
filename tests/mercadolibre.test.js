import test from 'node:test';
import assert from 'node:assert/strict';

import { createMercadoLibreClient } from '../src/lib/mercadolibreClient.js';
import {
  deriveCutoffDetail,
  deriveMercadoLibreLogistics,
} from '../src/lib/mercadolibreLogistics.js';
import { getMercadoLibrePackingMetrics } from '../src/lib/operationMetrics.js';

test('operation card counts only Mercado Libre shipments next to pack', () => {
  const metrics = getMercadoLibrePackingMetrics([
    { shipmentStatus: 'ready_to_ship', shipmentSubstatus: 'ready_to_print', logisticType: 'self_service' },
    { shipmentStatus: 'ready_to_ship', shipmentSubstatus: '', logisticType: 'cross_docking' },
    { shipmentStatus: 'ready_to_ship', shipmentSubstatus: 'ready_for_pickup', logisticType: 'self_service' },
    { shipmentStatus: 'shipped', shipmentSubstatus: '', logisticType: 'cross_docking' },
    { shipmentStatus: 'ready_to_ship', shipmentSubstatus: 'ready_to_print', logisticType: 'fulfillment' },
  ]);
  assert.deepEqual(metrics, { total: 2, flex: 1, colecta: 1 });
});

test('ready_to_ship + ready_to_print is printable', () => {
  const result = deriveMercadoLibreLogistics({
    shipmentId: '1001',
    shipmentStatus: 'ready_to_ship',
    shipmentSubstatus: 'ready_to_print',
  });

  assert.equal(result.packageState.id, 'ready_to_print');
  assert.equal(result.printability.id, 'printable');
});

test('ready_to_ship + ready_for_pickup is ready to dispatch', () => {
  const result = deriveMercadoLibreLogistics({
    shipmentId: '1001-b',
    shipmentStatus: 'ready_to_ship',
    shipmentSubstatus: 'ready_for_pickup',
  });

  assert.equal(result.packageState.id, 'ready_to_ship');
  assert.equal(result.printability.id, 'printed');
});

test('handling + waiting_for_label_generation is not ready', () => {
  const result = deriveMercadoLibreLogistics({
    shipmentId: '1002',
    shipmentStatus: 'handling',
    shipmentSubstatus: 'waiting_for_label_generation',
  });

  assert.equal(result.packageState.id, 'preparing');
  assert.equal(result.printability.id, 'not_ready');
});

test('shipped/out_for_delivery is in transit', () => {
  const result = deriveMercadoLibreLogistics({
    shipmentId: '1003',
    shipmentStatus: 'shipped',
    shipmentSubstatus: 'out_for_delivery',
  });

  assert.equal(result.packageState.id, 'in_transit');
});

test('delivered is delivered', () => {
  const result = deriveMercadoLibreLogistics({
    shipmentId: '1004',
    shipmentStatus: 'delivered',
    shipmentSubstatus: '',
  });

  assert.equal(result.packageState.id, 'delivered');
});

test('delays mark shipment as delayed', () => {
  const result = deriveMercadoLibreLogistics({
    shipmentId: '1005',
    shipmentStatus: 'ready_to_ship',
    shipmentSubstatus: 'ready_to_print',
    delays: { delays: [{ reason: 'carrier_delayed' }] },
  });

  assert.equal(result.packageState.id, 'delayed');
});

test('cutoff distinguishes exact Flex window from Colecta date-only limit', () => {
  const flexCutoff = deriveCutoffDetail({
    logisticType: 'self_service',
    carrier: {
      flex_assignment: {
        pickup_window: { from: '2026-06-03T16:00:00-03:00' },
      },
    },
  });

  assert.equal(flexCutoff.source, 'Asignacion Flex');
  assert.equal(flexCutoff.exact, true);
  assert.equal(flexCutoff.precision, 'datetime');

  const colectaCutoff = deriveCutoffDetail({
    logisticType: 'drop_off',
    leadTime: {
      estimated_handling_limit: { date: '2026-06-04' },
    },
  });

  assert.equal(colectaCutoff.source, 'ML lead time');
  assert.equal(colectaCutoff.exact, false);
  assert.equal(colectaCutoff.precision, 'date');
});

test('label download batches use at most 50 shipment ids', async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response('^XA^XZ', {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = createMercadoLibreClient({ accessToken: 'test-token' });
  const ids = Array.from({ length: 55 }, (_, index) => String(index + 1));
  const batches = await client.downloadShipmentLabelsZplBatches(ids);

  assert.equal(batches.length, 2);
  assert.equal(batches[0].shipmentIds.length, 50);
  assert.equal(batches[1].shipmentIds.length, 5);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].includes(encodeURIComponent(ids.slice(0, 50).join(','))));
  assert.ok(calls[1].includes(encodeURIComponent(ids.slice(50).join(','))));
});
