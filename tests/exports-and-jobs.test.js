import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { PICKING_CATALOG_CSV_COLUMNS, SHIPMENT_CSV_COLUMNS, TIENDANUBE_ORDER_CSV_COLUMNS, csv, csvFileName } from '../src/lib/csvExport.js';
import { csv as financeCsv } from '../src/lib/logisticsFinance.js';
import { JOB_STALE_MS, claimBackgroundJob, finishBackgroundJob, readBackgroundJob } from '../src/lib/backgroundJobs.js';
import { DEFAULT_GLOBAL_ADMIN_EMAIL, globalAdminEmails, primaryGlobalAdminEmail } from '../src/lib/adminEmails.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('CSV para Excel: BOM, punto y coma, comillas y sin fórmulas ejecutables', () => {
  const text = csv([{ a: 'Hola; "mundo"', b: '=SUM(A1)' }, { a: -12, b: '-5' }], [['A', 'a'], ['B', (row) => row.b]]);
  assert.ok(text.startsWith('﻿'));
  assert.deepEqual(text.slice(1).split('\r\n'), ['"A";"B"', '"Hola; ""mundo""";"\'=SUM(A1)"', '"-12";"-5"']);
  assert.equal(financeCsv, csv, 'finanzas usa el mismo helper');
  assert.equal(csvFileName('pedidos tiendanube', new Date('2026-11-27T15:00:00Z')), 'pedidos-tiendanube-2026-11-27');
});

test('columnas de pedidos Tiendanube y catálogo arman texto legible', () => {
  const order = { number: '1001', createdAt: '2026-11-27', dispatchStatus: 'dispatched', products: [{ quantity: 2, name: 'Teclado', sku: 'KB-49' }, { name: { es: 'Cable' } }] };
  const row = Object.fromEntries(TIENDANUBE_ORDER_CSV_COLUMNS.map(([name, key]) => [name, typeof key === 'function' ? key(order) : order[key]]));
  assert.equal(row.Despacho, 'Enviado');
  assert.equal(row.Productos, '2 x Teclado [KB-49] | 1 x Cable');
  const item = { title: 'Teclado', skus: ['KB-49', 'KB-49B'], active: false, note: '', accounts: ['PCMIDI'], listings: [{ item_id: 'MLA1' }, { item_id: 'MLA2' }] };
  const values = PICKING_CATALOG_CSV_COLUMNS.map(([, key]) => (typeof key === 'function' ? key(item) : item[key]));
  assert.deepEqual(values, ['Teclado', 'KB-49 KB-49B', 'No', '', 'PCMIDI', 'MLA1 MLA2']);
  assert.ok(SHIPMENT_CSV_COLUMNS.some(([name]) => name === 'Tracking'));
});

test('las listas exponen el CSV con los mismos filtros que la pantalla', () => {
  const shipments = read('src/app/api/shipments/route.js');
  assert.match(shipments, /searchParams\.get\('format'\) === 'csv'/);
  assert.match(shipments, /csvResponse\(result\.rows \|\| \[\], SHIPMENT_CSV_COLUMNS/);
  assert.match(read('src/app/api/package-history/route.js'), /PACKAGE_HISTORY_CSV_COLUMNS/);
  assert.match(read('src/components/Dashboard.js'), /format=csv/);
  assert.match(read('src/components/TiendanubeSection.js'), /downloadCsv\(orderedOrders, TIENDANUBE_ORDER_CSV_COLUMNS/);
  assert.match(read('src/components/PickingCatalog.js'), /downloadCsv\(visibleItems, PICKING_CATALOG_CSV_COLUMNS/);
});

test('trabajo en segundo plano: no se duplica, termina, falla visible y se libera si quedó cortado', async () => {
  const db = createClient({ url: ':memory:' });
  try {
    const t0 = new Date('2026-11-27T12:00:00Z');
    assert.equal(await readBackgroundJob(db, 1, 'sync', { now: t0 }), null);

    const first = await claimBackgroundJob(db, 1, 'sync', { now: t0 });
    assert.equal(first.started, true);
    assert.equal(first.job.status, 'running');
    assert.equal((await claimBackgroundJob(db, 1, 'sync', { now: new Date(t0.getTime() + 1000) })).started, false, 'segundo clic');
    assert.equal((await claimBackgroundJob(db, 2, 'sync', { now: t0 })).started, true, 'otro espacio corre aparte');

    await finishBackgroundJob(db, 1, 'sync', { result: { accounts: [{ name: 'PCMIDI', seeded: 3 }], failedAccounts: [] } });
    const done = await readBackgroundJob(db, 1, 'sync', { now: t0 });
    assert.equal(done.status, 'done');
    assert.equal(done.result.accounts[0].seeded, 3);

    assert.equal((await claimBackgroundJob(db, 1, 'sync', { now: t0 })).started, true, 'se puede volver a lanzar al terminar');
    await finishBackgroundJob(db, 1, 'sync', { error: new Error('ML caído') });
    assert.deepEqual(
      (({ status, error }) => ({ status, error }))(await readBackgroundJob(db, 1, 'sync', { now: t0 })),
      { status: 'error', error: 'ML caído' },
    );

    const later = new Date(t0.getTime() + JOB_STALE_MS + 1000);
    const cut = await readBackgroundJob(db, 2, 'sync', { now: later });
    assert.equal(cut.status, 'error', 'un "running" viejo fue cortado por Vercel');
    assert.equal((await claimBackgroundJob(db, 2, 'sync', { now: later })).started, true);
  } finally {
    db.close();
  }
});

test('el catálogo se descarga en segundo plano y la pantalla espera su resultado', () => {
  const route = read('src/app/api/picking-catalog/sync/route.js');
  assert.match(route, /claimBackgroundJob\(db, workspaceId, JOB_KIND\)/);
  assert.match(route, /after\(async \(\) =>/);
  assert.match(route, /status: 202/);
  assert.match(read('src/components/PickingCatalog.js'), /api\("\/picking-catalog\/sync"\)\)\.job/);
});

test('admin global: valor por defecto o lista configurada, en un solo lugar', () => {
  assert.deepEqual(globalAdminEmails({}), [DEFAULT_GLOBAL_ADMIN_EMAIL]);
  assert.deepEqual(globalAdminEmails({ CLERK_GLOBAL_ADMIN_EMAILS: ' A@x.com , ,b@y.com' }), ['a@x.com', 'b@y.com']);
  assert.equal(primaryGlobalAdminEmail({ CLERK_GLOBAL_ADMIN_EMAILS: 'a@x.com,b@y.com' }), 'a@x.com');
  for (const path of ['src/lib/auth.js', 'src/lib/dbInit.js', 'src/app/api/admin/diagnostico/route.js']) {
    assert.doesNotMatch(read(path), /camilopcmidi@gmail\.com/, `${path} conserva el email fijo`);
  }
});
