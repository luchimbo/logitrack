import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/app/api/${path}`, import.meta.url), 'utf8');
const handler = (source, method) => {
  const start = source.indexOf(`export async function ${method}(`);
  assert.ok(start >= 0, `no se encontró ${method}`);
  const next = source.indexOf('\nexport async function', start + 1);
  const match = [null, source.slice(start, next < 0 ? undefined : next)];
  assert.ok(match, `no se encontró ${method}`);
  return match[1];
};

test('DELETE /api/shipments sin lote ni período responde 400 en vez de vaciar el espacio', () => {
  const body = handler(read('shipments/route.js'), 'DELETE');
  assert.doesNotMatch(body, /SELECT id FROM shipments WHERE workspace_id = \?"/, 'quedó la consulta sin filtro');
  assert.match(body, /status: 400/);
  assert.match(body, /auditShipments\(authResult\.actor, 'delete_shipments'/);
});

const audited = [
  ['shipments/route.js', 'PATCH', /'update_shipment'/],
  ['shipments/[id]/route.js', 'DELETE', /action: 'delete_shipment'/],
  ['shipments/reassign-flex/route.js', 'POST', /action: 'reassign_flex_carriers'/],
  ['admin/mercadolibre/mark-printed/route.js', 'POST', /action: 'mark_ml_labels_printed'/],
];
for (const [path, method, action] of audited) {
  test(`${method} /api/${path} queda en la auditoría`, () => {
    assert.match(handler(read(path), method), action);
  });
}
