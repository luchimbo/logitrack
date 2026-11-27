import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = read('src/lib/tiendanubeStore.js');
const start = source.indexOf('export async function syncTiendanubeOrders(');
const end = source.indexOf('export async function listStoredTiendanubeOrders', start);
const code = source.slice(start, end).replace('export ', '');
const build = (saved) => new Function('ensureDb', 'upsertTiendanubeOrder', 'recordOnlineOrder', `${code}; return syncTiendanubeOrders;`)(
  async () => {},
  async (_workspace, order) => { saved.push(order.id); },
  async () => {},
);
const clientWith = (total, calls) => ({
  listOrders: async ({ page, perPage, updatedAtMin }) => {
    calls.push({ page, updatedAtMin });
    const from = (page - 1) * perPage;
    return Array.from({ length: Math.max(0, Math.min(perPage, total - from)) }, (_, i) => ({ id: from + i }));
  },
});

test('sync de Tiendanube avisa cuando corta por tope en vez de perder pedidos en silencio', async () => {
  const saved = [], calls = [], stats = {};
  const count = await build(saved)({ workspaceId: 1, client: clientWith(560, calls), stats });
  assert.equal(count, 500);
  assert.equal(stats.capped, true);
});

test('sync incremental recorre todas las páginas hasta su tope y pasa updated_at_min', async () => {
  const saved = [], calls = [], stats = {};
  const count = await build(saved)({ workspaceId: 1, client: clientWith(560, calls), updatedAtMin: '2026-11-27T09:00:00.000Z', maxPages: 40, stats });
  assert.equal(count, 560);
  assert.equal(stats.capped, false);
  assert.ok(calls.every((call) => call.updatedAtMin === '2026-11-27T09:00:00.000Z'));
});

test('los crons nuevos pasan el proxy por lista explícita y están programados', () => {
  const proxy = read('src/proxy.js');
  const crons = JSON.parse(read('vercel.json')).crons.map((cron) => cron.path);
  for (const path of ['/api/cron/mercadolibre-catchup', '/api/cron/tiendanube-sync']) {
    assert.ok(crons.includes(path), `${path} sin programar`);
    assert.ok(proxy.includes(`"${path}"`), `${path} no pasa el proxy`);
  }
  for (const path of crons) assert.ok(proxy.includes(`"${path}"`), `${path} programado pero bloqueado por el proxy`);
  assert.doesNotMatch(proxy, /startsWith\(["']\/api\/cron/);
  for (const path of crons) {
    assert.match(read(`src/app${path}/route.js`), /CRON_SECRET/, `${path} sin CRON_SECRET`);
  }
});

test('la desinstalación de Tiendanube marca la conexión para reconectar', () => {
  const webhook = read('src/app/api/webhooks/tiendanube/route.js');
  assert.match(webhook, /event === 'app\/uninstalled'[\s\S]*?markIntegrationConnectionAuthError/);
  assert.match(read('src/app/api/admin/tiendanube/finish/route.js'), /'app\/uninstalled'/);
});
