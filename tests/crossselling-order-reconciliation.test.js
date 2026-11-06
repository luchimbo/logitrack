import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderReconciler, ONLINE_TRACKING_START } from '../src/lib/crossselling/order-reconciliation.js';

function memoryRepository(initial = null) {
  const repo = { state: initial, finished: [] };
  repo.syncState = async () => repo.state;
  repo.acquire = async () => !repo.state?.lease_until;
  repo.finish = async (storeId, leaseId, at, result, error = null) => {
    repo.finished.push({ at, result, error });
    if (!error) repo.state = { ...repo.state, last_success_at: at };
  };
  return repo;
}

test('concilia por fecha de modificación sin filtrar estados, para captar transferencias recibidas tarde', async () => {
  const repo = memoryRepository();
  const calls = [];
  const recorded = [];
  const pages = [[{ id: 1 }, { id: 2 }], [{ id: 3 }]];
  const reconcile = createOrderReconciler({ repository: repo, perPage: 2, now: () => new Date('2026-10-22T15:00:00Z'),
    clientFor: async () => ({ listOrders: async (q) => { calls.push(q); return pages[q.page - 1]; } }),
    record: async (storeId, order) => recorded.push(order.id) });
  const result = await reconcile('78394');
  assert.equal(result.status, 'reconciled');
  assert.deepEqual(recorded, [1, 2, 3]);
  assert.equal(calls[0].updatedAtMin, ONLINE_TRACKING_START);
  assert.equal(calls[0].status, 'any');
  assert.equal(calls[0].paymentStatus, 'any');
  assert.equal(calls[0].createdAtMin, undefined);
  assert.equal(repo.state.last_success_at, '2026-10-22T15:00:00.000Z');
});

test('retoma desde la última revisión con margen y no repite dentro del intervalo', async () => {
  const repo = memoryRepository({ last_success_at: '2026-10-22T14:00:00.000Z' });
  const calls = [];
  let now = new Date('2026-10-22T15:00:00Z');
  const reconcile = createOrderReconciler({ repository: repo, now: () => now,
    clientFor: async () => ({ listOrders: async (q) => { calls.push(q); return []; } }), record: async () => {} });
  await reconcile('78394');
  assert.equal(calls[0].updatedAtMin, '2026-10-22T13:50:00.000Z');
  now = new Date('2026-10-22T15:01:00Z');
  assert.equal((await reconcile('78394')).status, 'current');
  assert.equal(calls.length, 1);
});

test('un error al guardar no adelanta la última revisión', async () => {
  const repo = memoryRepository({ last_success_at: '2026-10-22T14:00:00.000Z' });
  const reconcile = createOrderReconciler({ repository: repo, now: () => new Date('2026-10-22T15:00:00Z'),
    clientFor: async () => ({ listOrders: async () => [{ id: 11025 }] }),
    record: async () => { throw new Error('db caída'); } });
  await assert.rejects(reconcile('78394'), /db caída/);
  assert.equal(repo.state.last_success_at, '2026-10-22T14:00:00.000Z');
  assert.ok(repo.finished.at(-1).error);
});

test('una conciliación en curso no se superpone', async () => {
  const repo = memoryRepository({ lease_until: '2026-10-22T15:04:00.000Z' });
  const reconcile = createOrderReconciler({ repository: repo, now: () => new Date('2026-10-22T15:00:00Z'),
    clientFor: async () => assert.fail('no debe consultar'), record: async () => {} });
  await assert.rejects(reconcile('78394'), (e) => e.status === 409);
});
