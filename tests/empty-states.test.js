import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_STATES, flexGuide, loadFailure } from '../src/lib/emptyStates.js';

test('Flex sin paquetes guía hacia Canales y la carga de etiquetas', () => {
  const guide = flexGuide({ shipments: [], carriers: [{ id: 1 }] });
  assert.deepEqual(guide.actions.map((a) => a.tab), ['integrations', 'upload']);
  assert.equal(guide.extra, undefined);
});

test('Flex sin transportistas agrega el aviso de configurar zonas', () => {
  const guide = flexGuide({ shipments: [], carriers: [] });
  assert.equal(guide.extra.actions[0].tab, 'zoneConfig');
});

test('Flex con paquetes no muestra guía', () => {
  assert.equal(flexGuide({ shipments: [{ id: 1 }], carriers: [] }), null);
});

test('Colecta aclara que se muestran los envíos de hoy', () => {
  assert.match(EMPTY_STATES.colecta.title, /hoy/);
});

test('una carga fallida nunca dice que no hay datos', () => {
  const failure = loadFailure('Flex', 'No pudimos conectar.');
  assert.match(failure.title, /No pudimos cargar Flex/);
  assert.equal(failure.text, 'No pudimos conectar.');
  assert.ok(!/no hay|todavía no/i.test(failure.title));
});
