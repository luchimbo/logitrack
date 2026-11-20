import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/lib/mercadolibreStore.js', import.meta.url), 'utf8');
const start = source.indexOf('export async function syncMercadoLibreOrders({');
const end = source.indexOf('// Fuente autoritativa', start);
const code = source.slice(start, end).replace('export ', '');
function harness() {
  let active = 0, peak = 0;
  const saved = [], retries = [];
  const sync = new Function('ensureDb', 'fetchFullOrder', 'upsertMercadoLibreOrder', 'enqueueMercadoLibreRetry', code + '; return syncMercadoLibreOrders;')(
    async () => {},
    async (_client, order) => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
      if (order.id === 'bad') throw new Error('temporary failure');
      return order;
    },
    async (_workspace, full) => { saved.push(full.id); },
    async ({ orderId }) => { retries.push(orderId); },
  );
  return { sync, saved, retries, peak: () => peak };
}
test('daily sync bounds parallelism, saves every page and isolates a failed order', async () => {
  const h = harness();
  const rows = Array.from({length: 53}, (_, i) => ({id: String(i)}));
  rows[5] = {id: 'bad'};
  const pages = [];
  const count = await h.sync({workspaceId: 1, externalStoreId: 'seller', concurrency: 4,
    client: { searchOrders: async ({offset, limit}) => { pages.push(offset); return {results: rows.slice(offset, offset + limit)}; } }});
  assert.deepEqual(pages, [0, 50]);
  assert.equal(count, 52);
  assert.equal(new Set(h.saved).size, 52);
  assert.equal(h.peak(), 4);
  assert.deepEqual(h.retries, ['bad', 'bad']);
});
test('other callers retain serial synchronization by default', async () => {
  const h = harness();
  assert.equal(await h.sync({externalStoreId: 'seller', client: {searchOrders: async () => ({results:[{id:'1'},{id:'2'}]})}}), 2);
  assert.equal(h.peak(), 1);
});
