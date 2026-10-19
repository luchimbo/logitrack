import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authorizePublication } from '../src/lib/crossselling/publication-auth.js';
import { publicationSignature } from '../src/lib/crossselling/engine/publish-protocol.js';
import { createModuleHandler } from '../src/lib/crossselling/module-endpoint.js';

const key = 'k'.repeat(40), now = Date.parse('2026-10-19T12:00:00Z');
const keysJson = JSON.stringify({ 7570182: key, 78394: 'p'.repeat(40), 99999: 'q'.repeat(40) });
const status = (enabled) => ({ storeId: '7570182', state: { workspaceId: 2, promotionId: 'promo-1', enabled, acceptances: [] },
  promotions: [{ id: 'promo-1', active: enabled }], scripts: [{ id: 11451, name: 'Completá tu equipo' }, { id: 9, name: 'Otro' }],
  publication: { revision: 'abc', publishedAt: '2026-10-19T11:00:00Z', selectedRules: 4, mappedProducts: 120 }, events: [{ cartId: 'x' }] });

function signed(method, storeId, body = '', signKey = key) {
  const path = `/api/cross-selling/module?storeId=${storeId}`, timestamp = String(now);
  return new Request(`https://www.geomodi.ai${path}`, { method, body: method === 'GET' ? undefined : body,
    headers: { 'x-mostrador-timestamp': timestamp, 'x-mostrador-signature': publicationSignature({ key: signKey, method, path, timestamp, body }) } });
}
function setup({ connection = { workspaceId: 2, config: { storeId: '7570182' } } } = {}) {
  const calls = [];
  let enabled = false;
  const handle = createModuleHandler({
    authorize: (input) => authorizePublication({ ...input, keysJson, now }),
    lookupConnection: async (storeId) => { calls.push(['lookup', storeId]); return connection; },
    offerStatus: async (workspaceId) => { calls.push(['status', workspaceId]); return status(enabled); },
    changeOffer: async (workspaceId, input) => { calls.push(['change', workspaceId, input.action]); enabled = input.action === 'enable'; return status(enabled); },
  });
  return { handle, calls };
}

test('módulo: GET firmado devuelve estado resumido sin eventos de carritos', async () => {
  const { handle, calls } = setup();
  const res = await handle(signed('GET', '7570182'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { storeId: '7570182', enabled: false, promotion: { id: 'promo-1', found: true, active: false },
    script: { found: true, ids: [11451] }, publication: { revision: 'abc', publishedAt: '2026-10-19T11:00:00Z', selectedRules: 4, mappedProducts: 120 } });
  assert.deepEqual(calls, [['lookup', '7570182'], ['status', 2]]);
});

test('módulo: PUT activa y desactiva con el espacio dueño de la conexión', async () => {
  const { handle, calls } = setup();
  assert.equal((await (await handle(signed('PUT', '7570182', '{"enabled":true}'))).json()).enabled, true);
  assert.equal((await (await handle(signed('PUT', '7570182', '{"enabled":false}'))).json()).enabled, false);
  assert.deepEqual(calls.filter((c) => c[0] === 'change'), [['change', 2, 'enable'], ['change', 2, 'disable']]);
});

test('módulo: firma inválida, cuerpo alterado o vencida no llegan a Tiendanube', async () => {
  const { handle, calls } = setup();
  assert.equal((await handle(signed('PUT', '7570182', '{"enabled":true}', 'x'.repeat(40)))).status, 401);
  const altered = signed('PUT', '7570182', '{"enabled":false}');
  const tampered = new Request(altered.url, { method: 'PUT', body: '{"enabled":true}', headers: altered.headers });
  assert.equal((await handle(tampered)).status, 401);
  const old = new Request(altered.url, { method: 'GET', headers: { 'x-mostrador-timestamp': String(now - 10 * 60_000),
    'x-mostrador-signature': publicationSignature({ key, method: 'GET', path: '/api/cross-selling/module?storeId=7570182', timestamp: String(now - 10 * 60_000) }) } });
  assert.equal((await handle(old)).status, 401);
  assert.equal((await handle(new Request(altered.url))).status, 401);
  assert.deepEqual(calls, []);
});

test('módulo: una tienda con clave válida pero no habilitada recibe 403', async () => {
  const { handle, calls } = setup();
  const res = await handle(signed('PUT', '99999', '{"enabled":true}', 'q'.repeat(40)));
  assert.equal(res.status, 403);
  assert.deepEqual(calls, []);
});

test('módulo: PC MIDI está habilitada y opera con su propia tienda', async () => {
  const calls = [];
  const handle = createModuleHandler({
    authorize: (input) => authorizePublication({ ...input, keysJson, now }),
    lookupConnection: async () => ({ workspaceId: 1, config: { storeId: '78394' } }),
    offerStatus: async (workspaceId, storeId) => { calls.push(['status', workspaceId, storeId]); return { ...status(true), storeId }; },
    changeOffer: async (workspaceId, input, storeId) => { calls.push(['change', workspaceId, input.action, storeId]); return { ...status(true), storeId }; },
  });
  assert.equal((await handle(signed('PUT', '78394', '{"enabled":true}', 'p'.repeat(40)))).status, 200);
  assert.deepEqual(calls, [['change', 1, 'enable', '78394']]);
  assert.equal((await handle(signed('PUT', '78394', '{"enabled":true}'))).status, 401, 'la clave de la demo no sirve para PC MIDI');
});

test('módulo: conexión ausente, cuerpo inválido y errores de proveedor', async () => {
  assert.equal((await setup({ connection: null }).handle(signed('GET', '7570182'))).status, 409);
  assert.equal((await setup({ connection: { workspaceId: 2, config: { storeId: '1' } } }).handle(signed('GET', '7570182'))).status, 409);
  const { handle } = setup();
  assert.equal((await handle(signed('PUT', '7570182', '{"enabled":"si"}'))).status, 400);
  assert.equal((await handle(signed('PUT', '7570182', '{'))).status, 400);
  const failing = createModuleHandler({ authorize: (input) => authorizePublication({ ...input, keysJson, now }),
    lookupConnection: async () => ({ workspaceId: 2, config: { storeId: '7570182' } }),
    offerStatus: async () => { throw Object.assign(new Error('token secreto en respuesta'), { status: 500 }); },
    changeOffer: async () => { throw Object.assign(new Error('Primero publicá las reglas desde Mostrador'), { status: 409 }); } });
  const res = await failing(signed('GET', '7570182'));
  assert.equal(res.status, 502);
  assert.doesNotMatch((await res.json()).error, /secreto/);
  const conflict = await failing(signed('PUT', '7570182', '{"enabled":true}'));
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error, 'Primero publicá las reglas desde Mostrador');
});

test('módulo: la ruta es pública en el proxy y verifica la firma en el handler', () => {
  const proxy = readFileSync(new URL('../src/proxy.js', import.meta.url), 'utf8');
  assert.match(proxy, /pathname === "\/api\/cross-selling\/module"\) return NextResponse\.next\(\)/);
  const route = readFileSync(new URL('../src/app/api/cross-selling/module/route.js', import.meta.url), 'utf8');
  assert.match(route, /authorize: authorizePublication/);
});
