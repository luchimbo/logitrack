import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Correo Argentino queda oculto hasta terminar la integración: sus rutas API existen pero no se ofrece.
test('Correo Argentino no se ofrece en la portada ni en Canales mientras no esté terminado', () => {
  assert.doesNotMatch(read('src/app/page.js'), /Correo Argentino/);
  assert.match(read('src/app/api/admin/integrations/route.js'), /provider: 'correo_argentino'[\s\S]*?status: 'coming_soon'/);
  assert.match(read('src/components/IntegrationsSection.js'), /integration\.status !== 'coming_soon' \|\| integration\.connected/);
});
