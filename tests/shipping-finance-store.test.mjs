import test from 'node:test';
import assert from 'node:assert/strict';
import * as moduleApi from 'node:module';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

test('financial store freezes costs, isolates workspaces and preserves full detail on light synchronization', { skip: !moduleApi.registerHooks }, async () => {
  const folder = mkdtempSync(join(tmpdir(), 'logitrack-finance-test-'));
  const hooks = moduleApi.registerHooks({ resolve(specifier, context, next) {
    let target = specifier.startsWith('@/') ? new URL('../src/' + specifier.slice(2) + '.js', import.meta.url).href : specifier;
    if (specifier.startsWith('.') && context.parentURL?.includes('/src/')) {
      const url = new URL(specifier + '.js', context.parentURL);
      if (existsSync(fileURLToPath(url))) target = url.href;
    }
    return next(target, context);
  } });
  process.env.TURSO_DATABASE_URL = pathToFileURL(join(folder, 'finance.db')).href;
  delete process.env.TURSO_AUTH_TOKEN;
  const { initDb } = await import('../src/lib/dbInit.js');
  const { db } = await import('../src/lib/db.js');
  try {
    await initDb();
    const { upsertMercadoLibreOrder } = await import('../src/lib/mercadolibreStore.js');
    const { financeReport } = await import('../src/lib/financeStore.js');
    await db.execute("INSERT INTO shipments (id, workspace_id, product_name, partido, province, assigned_carrier) VALUES (991, 991, 'Prueba', 'San Isidro', 'Buenos Aires', 'Sur')");
    await db.execute("INSERT INTO carrier_rates (workspace_id, carrier_name, zone, effective_from, amount_cents) VALUES (991, 'Sur', 'GBA 1', '2026-10-01', 300000)");
    const payload = { order: { id: 991, seller: { id: 123 }, total_amount: 10000, currency_id: 'ARS', status: 'paid', date_created: '2026-10-01T12:00:00-03:00', shipping: { id: 991 } },
      shipment: { id: 991, status: 'shipped', logistic: { type: 'self_service' }, date_created: '2026-10-01T12:00:00-03:00', destination: { shipping_address: { city: { name: 'San Isidro' }, state: { name: 'Buenos Aires' } } } },
      history: [{ status: 'shipped', date: '2026-10-01T13:00:00-03:00' }], leadTime: { estimated_delivery_time: { date: '2026-10-01T20:00:00-03:00' } } };
    const context = { connectionId: 991, externalStoreId: '123' };
    await upsertMercadoLibreOrder(991, payload, context);
    await db.execute('UPDATE mercadolibre_orders SET shipment_row_id = 991 WHERE workspace_id = 991');
    assert.equal((await financeReport(991, {})).totals.costCents, 0);
    const delivered = { ...payload, light: true, leadTime: null, history: [], shipment: { ...payload.shipment, status: 'delivered', status_history: { date_delivered: '2026-10-01T18:00:00-03:00' } } };
    await upsertMercadoLibreOrder(991, delivered, context);
    const first = await financeReport(991, {});
    assert.equal(first.totals.costCents, 300000);
    assert.equal(first.packages[0].history.length, 1);
    assert.equal(first.packages[0].deadline, '2026-10-01T20:00:00-03:00');
    await db.execute('UPDATE carrier_rates SET amount_cents = 500000 WHERE workspace_id = 991');
    await db.execute("UPDATE shipments SET assigned_carrier = 'Otro', partido = 'Pilar' WHERE id = 991");
    await upsertMercadoLibreOrder(991, delivered, context);
    const historical = await financeReport(991, {});
    assert.equal(historical.totals.costCents, 300000);
    assert.equal(historical.packages[0].carrier, 'Sur');
    assert.equal((await financeReport(992, {})).totals.costCents, 0);
    assert.equal((await db.execute('SELECT * FROM flex_delivery_charges WHERE workspace_id = 991')).rows.length, 1);
    await assert.rejects(upsertMercadoLibreOrder(991, { ...payload, shipment: null }, context));
    assert.equal((await financeReport(991, {})).packages[0].status, 'delivered');
  } finally { db.close(); hooks.deregister(); rmSync(folder, { recursive: true, force: true }); }
});
