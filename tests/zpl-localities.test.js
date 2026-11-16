import test from 'node:test';
import assert from 'node:assert/strict';
import { parseZplFile, resolvePartidoFromGeo } from '../src/lib/zplParser.js';

test('Adrogué resolves to Almirante Brown for accented and label locality names', () => {
  for (const city of ['Adrogué', 'ADROGUE', 'Adrogué, Almirante Brown', 'Almirante Brown']) {
    assert.equal(resolvePartidoFromGeo(city, 'Buenos Aires'), 'almirante_brown');
  }
  assert.equal(resolvePartidoFromGeo('Temperley', 'Buenos Aires'), 'lomas_de_zamora');
});

test('Flex resolves El Libertador and a partido found after the postal code', () => {
  assert.equal(resolvePartidoFromGeo('El Libertador', 'Buenos Aires'), '3_de_febrero');
  for (const [city, expected] of [
    ['El Libertador', '3_de_febrero'],
    ['Barrio sin alias', '3_de_febrero'],
    ['Haedo', 'moron'],
  ]) {
    const [shipment] = parseZplFile(`^XA
^FD"sender_id":"123456","hash_code":"hash","id":"123456789"^FS
^FO0,580^A0N,45,45^FB800,1,0,C^FH^FD${city}^FS
^FDCP:^FS^FD1657^FS^FDTRES DE FEBRERO^FS
^FX 3 Horizontal Line^XZ`);

    assert.equal(shipment.city, city);
    assert.equal(shipment.province, 'TRES DE FEBRERO');
    assert.equal(shipment.partido, expected);
  }
});

test('Flex resolves localities printed alone in the zone field', () => {
  for (const [zone, expected] of [
    ['DEL VISO', 'pilar'],
    ['GUERNICA', 'pte_peron'],
    ['BUENOS AIRES', null],
  ]) {
    const [shipment] = parseZplFile(`^XA
^FD"sender_id":"123456","hash_code":"hash","id":"123456789"^FS
^FO0,660^A0N,40,40^FB800,1,0,C^FH^FD${zone}^FS^XZ`);

    assert.equal(shipment.city, null);
    assert.equal(shipment.province, zone);
    assert.equal(shipment.partido, expected);
  }
});
