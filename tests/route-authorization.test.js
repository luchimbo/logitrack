import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Ocultar un botón no sustituye la validación del servidor: toda escritura sobre
// transportistas y zonas debe exigir administrador del espacio y resolver el alcance del espacio autenticado.
const routes = ['carriers/route.js', 'carriers/[id]/route.js', 'zones/route.js', 'zones/[id]/route.js'];
for (const route of routes) {
  test(`/api/${route}: las escrituras exigen administrador y alcance del espacio`, () => {
    const source = readFileSync(new URL(`../src/app/api/${route}`, import.meta.url), 'utf8');
    const handlers = [...source.matchAll(/export async function (POST|PUT|PATCH|DELETE)\b([\s\S]*?)(?=\nexport async function|$)/g)];
    assert.ok(handlers.length, 'no se encontraron escrituras');
    for (const [, method, body] of handlers) {
      assert.match(body, /requireWorkspaceAdmin\(/, `${method} sin requireWorkspaceAdmin`);
      assert.match(body, /carrierConfigScope\(/, `${method} sin alcance de espacio`);
      assert.doesNotMatch(body, /workspaceId\s*=\s*(await\s+)?request\.|searchParams\.get\(['"]workspace/, `${method} toma el espacio de la petición`);
    }
  });
}
