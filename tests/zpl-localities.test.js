import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePartidoFromGeo } from '../src/lib/zplParser.js';

test('Adrogué resolves to Almirante Brown for accented and label locality names', () => {
  for (const city of ['Adrogué', 'ADROGUE', 'Adrogué, Almirante Brown', 'Almirante Brown']) {
    assert.equal(resolvePartidoFromGeo(city, 'Buenos Aires'), 'almirante_brown');
  }
  assert.equal(resolvePartidoFromGeo('Temperley', 'Buenos Aires'), 'lomas_de_zamora');
});
