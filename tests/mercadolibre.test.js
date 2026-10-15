import test from 'node:test';
import assert from 'node:assert/strict';

import { createMercadoLibreClient } from '../src/lib/mercadolibreClient.js';
import {
  deriveCutoffDetail,
  deriveMercadoLibreLogistics,
} from '../src/lib/mercadolibreLogistics.js';
import { getMercadoLibrePackingMetrics } from '../src/lib/operationMetrics.js';
import { parseZplFile } from '../src/lib/zplParser.js';
import { isDispatchDateValue, isLabelScheduleValue, isNonProductLabelValue } from '../src/lib/dispatchDate.js';

function flexLabel(fields) {
  return `^XA
^FO10,10^A0N,20,20^FDEnvio Flex^FS
${fields}
^XZ`;
}

test('Flex parser extracts product metadata independently of label coordinates', () => {
  const [shipment] = parseZplFile(flexLabel(`
^FO48,118^A0N,30,30^FB600,3,-1^FH^FDAuriculares Bluetooth | 2 u.^FS
^FO48,177^A0N,22,22^FB600,3,-1^FH^FDSKU: AUR-NEG-01 | Color: Negro | Voltaje: 5V^FS
`));

  assert.equal(shipment.shipping_method, 'flex');
  assert.equal(shipment.product_name, 'Auriculares Bluetooth');
  assert.equal(shipment.sku, 'AUR-NEG-01');
  assert.equal(shipment.color, 'Negro');
  assert.equal(shipment.voltage, '5V');
});

test('Flex parser does not confuse a dispatch date with the product', () => {
  const [shipment] = parseZplFile(flexLabel(`
^FO200,100^A0N,27,27^FB570,3,-1^FH^FD27 AUG^FS
^FO48,118^A0N,30,30^FB600,3,-1^FH^FDMicrófono condenser profesional^FS
^FO48,177^A0N,22,22^FB600,3,-1^FH^FDSKU: MIC-01^FS
`));

  assert.equal(shipment.product_name, 'Micrófono condenser profesional');
  assert.equal(shipment.sku, 'MIC-01');
});

test('Flex parser ignores the "hasta las 21 hs" delivery window as product', () => {
  // Etiqueta real (14 OCT): producto en ^FB570,6 y SKU en y=262, justo debajo de la franja horaria.
  const [shipment] = parseZplFile(flexLabel(`
^FO10,210^A0N,25,25^FB150,1,0,C^FDUnidad^FS
^FO200,100^A0N,27,27^FB570,6,-1^FH^FDControlador Y Teclado Arturia Minilab 25 Black Midi Usb Store^FS
^FO200,262^A0N,24,24^FB570,1,-1^FH^FDSKU: ZTO121^FS
^FO400,195^A0N,48,48^FB400,1,0,C^FD14 OCT^FS
^FO400,260^A0N,40,40^FB400,1,0,C^FDhasta las 21 hs^FS
`));

  assert.equal(shipment.product_name, 'Controlador Y Teclado Arturia Minilab 25 Black Midi Usb Store');
  assert.equal(shipment.sku, 'ZTO121');
  assert.equal(shipment.dispatch_date, '14 OCT');
});

test('Flex parser never takes the "Unidad" caption as product', () => {
  // Etiqueta real (ZTO019): recuadro de producto de 5 líneas y leyenda "Unidad" bajo la cantidad.
  const [shipment] = parseZplFile(flexLabel(`
^FO10,130^A0N,70,70^FB160,1,0,C^FD1^FS
^FO10,210^A0N,25,25^FB150,1,0,C^FDUnidad^FS
^FO200,100^A0N,27,27^FB570,5,-1^FH^FDPlaca Interfaz De Audio Usb 24 Bits Arturia Minifuse 1 White Color Blanco^FS
^FO200,235^A0N,24,24^FB570,3,-1^FH^FDColor: Blanco  | Voltaje: 5V  | SKU: ZTO019^FS
`));
  assert.equal(shipment.product_name, 'Placa Interfaz De Audio Usb 24 Bits Arturia Minifuse 1 White Color Blanco');
  assert.equal(shipment.sku, 'ZTO019');

  // Aunque el producto venga en coordenadas que el parser no conoce, "Unidad" no es candidato.
  const [moved] = parseZplFile(flexLabel(`
^FO10,210^A0N,25,25^FB150,1,0,C^FDUnidades^FS
^FO48,118^A0N,30,30^FB600,3,-1^FH^FDCable Midi 2 Metros^FS
^FO48,235^A0N,22,22^FB600,3,-1^FH^FDSKU: FZC020^FS
`));
  assert.equal(moved.product_name, 'Cable Midi 2 Metros');
  assert.equal(isNonProductLabelValue('Unidad'), true);
  assert.equal(isNonProductLabelValue('Unidad Central De Audio'), false);
});

test('delivery window texts are never product names', () => {
  for (const value of ['hasta las 21 hs', 'Hasta las 21hs', 'hasta 21:00', 'de 9 a 21 hs', 'entre 14:00 y 18:00 hs', 'desde las 8 hs']) {
    assert.equal(isLabelScheduleValue(value), true, value);
  }
  for (const value of ['Pedal De 3 Vias', 'Cable 21 hs Kit', 'Teclado 61 Teclas']) {
    assert.equal(isLabelScheduleValue(value), false, value);
  }
});

test('dispatch date guard flags all known date shapes, not just "DD MON"', () => {
  assert.equal(isDispatchDateValue('27 AUG'), true);
  assert.equal(isDispatchDateValue('27 AUG 26'), true);
  assert.equal(isDispatchDateValue('27 AUG 2026'), true);
  assert.equal(isDispatchDateValue('AUG 27'), true);
  assert.equal(isDispatchDateValue('  27 aug  '), true);

  assert.equal(isDispatchDateValue('MAY 30L'), false);
  assert.equal(isDispatchDateValue('Micrófono condenser'), false);
  assert.equal(isDispatchDateValue('SIN-SKU'), false);
});

test('Flex parser rejects a full stamped date (with year) as the product', () => {
  const [shipment] = parseZplFile(flexLabel(`
 ^FO200,100^A0N,27,27^FB570,3,-1^FH^FD27 AUG 26^FS
 ^FO48,118^A0N,30,30^FB600,3,-1^FH^FDEspátula de madera^FS
 ^FO48,177^A0N,22,22^FB600,3,-1^FH^FDSKU: ESP-01^FS
 `));

  assert.equal(shipment.product_name, 'Espátula de madera');
  assert.equal(shipment.sku, 'ESP-01');
});

test('Flex parser rejects a month-first date as the product', () => {
  const [shipment] = parseZplFile(flexLabel(`
 ^FO200,100^A0N,27,27^FB570,3,-1^FH^FDAUG 27^FS
 ^FO48,118^A0N,30,30^FB600,3,-1^FH^FDCargador USB doble^FS
 ^FO48,177^A0N,22,22^FB600,3,-1^FH^FDSKU: CAR-DBL^FS
 `));

  assert.equal(shipment.product_name, 'Cargador USB doble');
  assert.equal(shipment.sku, 'CAR-DBL');
});

test('Flex parser preserves multiple products and variants', () => {
  const [shipment] = parseZplFile(flexLabel(`
^FO48,100^A0N,30,30^FB600,3,-1^FH^FDProducto Uno^FS
^FO48,150^A0N,22,22^FB600,3,-1^FH^FDSKU: UNO-01 | Color: Rojo^FS
^FO48,210^A0N,30,30^FB600,3,-1^FH^FDProducto Dos^FS
^FO48,260^A0N,22,22^FB600,3,-1^FH^FDSKU: DOS-02 | Voltaje: 220V^FS
`));

  assert.equal(shipment.product_name, 'Producto Uno | Producto Dos');
  assert.equal(shipment.sku, 'UNO-01 | DOS-02');
  assert.equal(shipment.color, 'Rojo');
  assert.equal(shipment.voltage, '220V');
});

test('Flex parser never invents SIN-SKU when the source label has no SKU', () => {
  const [shipment] = parseZplFile(flexLabel(`
^FO48,118^A0N,30,30^FB600,3,-1^FH^FDProducto sin variante^FS
`));

  assert.equal(shipment.product_name, 'Producto sin variante');
  assert.equal(shipment.sku, null);
});

test('operation card counts only Mercado Libre shipments next to pack', () => {
  const metrics = getMercadoLibrePackingMetrics([
    { shipmentStatus: 'ready_to_ship', shipmentSubstatus: 'ready_to_print', logisticType: 'self_service', printability: { id: 'imported' } },
    { shipmentStatus: 'ready_to_ship', shipmentSubstatus: 'ready_to_print', logisticType: 'cross_docking', printability: { id: 'printed' } },
    { shipmentStatus: 'ready_to_ship', shipmentSubstatus: 'ready_for_pickup', logisticType: 'self_service', printability: { id: 'printed' } },
    { shipmentStatus: 'shipped', shipmentSubstatus: '', logisticType: 'cross_docking', printability: { id: 'not_ready' } },
    { shipmentStatus: 'ready_to_ship', shipmentSubstatus: 'ready_to_print', logisticType: 'fulfillment', printability: { id: 'not_ready' } },
  ]);
  assert.deepEqual(metrics, { total: 2, flex: 1, colecta: 1 });
});

test('operation card counts Mercado Libre packs as one physical package', () => {
  const metrics = getMercadoLibrePackingMetrics([
    { id: 'sale-1', shipmentId: 'shipment-100', shipmentStatus: 'ready_to_ship', shipmentSubstatus: 'ready_to_print', logisticType: 'self_service', printability: { id: 'printable' } },
    { id: 'sale-2', shipmentId: 'shipment-100', shipmentStatus: 'ready_to_ship', shipmentSubstatus: 'ready_to_print', logisticType: 'self_service', printability: { id: 'printable' } },
    { id: 'sale-3', shipmentId: 'shipment-101', shipmentStatus: 'ready_to_ship', shipmentSubstatus: 'ready_to_print', logisticType: 'cross_docking', printability: { id: 'printable' } },
  ]);

  assert.deepEqual(metrics, { total: 2, flex: 1, colecta: 1 });
});

test('operation card ignores the local label import state', () => {
  const metrics = getMercadoLibrePackingMetrics([
    { shipmentId: 'shipment-200', shipmentStatus: 'ready_to_ship', shipmentSubstatus: 'ready_to_print', logisticType: 'self_service', printability: { id: 'imported' } },
    { shipmentId: 'shipment-201', shipmentStatus: 'ready_to_ship', shipmentSubstatus: 'ready_to_print', logisticType: 'cross_docking', printability: { id: 'printed' } },
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

test('Flex next-day label in buffering is "En proceso" with the hour it unlocks', () => {
  const result = deriveMercadoLibreLogistics({
    shipmentId: '1010',
    shipmentStatus: 'ready_to_ship',
    shipmentSubstatus: 'buffered',
    logisticType: 'self_service',
    leadTime: { buffering: { date: '2026-10-15T20:00:00.000-03:00' } },
    now: new Date('2026-10-15T10:00:00.000-03:00'),
  });

  assert.equal(result.packageState.id, 'buffered');
  assert.equal(result.printability.id, 'buffered');
  assert.equal(result.printability.canPrint, false);
  assert.equal(result.printability.availableLabel, '15/10 20:00');
  assert.match(result.printability.reason, /se imprime desde 15\/10 20:00/);
  assert.equal(result.dispatchState, 'pending');
});

test('future buffering date holds the label even if the substatus is empty', () => {
  const result = deriveMercadoLibreLogistics({
    shipmentId: '1011',
    shipmentStatus: 'ready_to_ship',
    shipmentSubstatus: '',
    leadTime: { buffering: { date: '2026-10-15T20:00:00.000-03:00' } },
    now: new Date('2026-10-15T19:59:00.000-03:00'),
  });

  assert.equal(result.printability.id, 'buffered');
});

test('label is printable once ML releases it from buffering', () => {
  const released = deriveMercadoLibreLogistics({
    shipmentId: '1012',
    shipmentStatus: 'ready_to_ship',
    shipmentSubstatus: 'ready_to_print',
    leadTime: { buffering: { date: '2026-10-15T20:00:00.000-03:00' } },
    now: new Date('2026-10-15T10:00:00.000-03:00'),
  });
  assert.equal(released.printability.id, 'printable');

  const sameDay = deriveMercadoLibreLogistics({
    shipmentId: '1013',
    shipmentStatus: 'ready_to_ship',
    shipmentSubstatus: '',
    leadTime: { buffering: { date: null } },
  });
  assert.equal(sameDay.printability.id, 'printable');
});

test('buffered past its hour asks to sync instead of printing', () => {
  const result = deriveMercadoLibreLogistics({
    shipmentId: '1014',
    shipmentStatus: 'ready_to_ship',
    shipmentSubstatus: 'buffered',
    leadTime: { buffering: { date: '2026-10-15T20:00:00.000-03:00' } },
    now: new Date('2026-10-15T21:00:00.000-03:00'),
  });

  assert.equal(result.printability.id, 'buffered');
  assert.equal(result.printability.stale, true);
  assert.match(result.printability.reason, /sincroniz/);
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
