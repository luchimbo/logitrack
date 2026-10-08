import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { applicableRate, sellerShippingCost, packageFromOrder, buildFinanceReport, validDate, moneyCents } from '../src/lib/shippingFinance.js';
import { financeStatements } from '../src/lib/financeSchema.js';
const rates = [
  { id: 1, carrier_name: 'Sur', zone: 'GBA 1', effective_from: '2026-09-01', amount_cents: 250000 },
  { id: 2, carrier_name: 'Sur', zone: 'GBA 1', effective_from: '2026-10-01', amount_cents: 300000 },
];
function order(overrides = {}) {
  return { order_id: '1', shipment_id: '99', integration_connection_id: 1, user_id: '123', status: 'paid', currency: 'ARS', total: '10000',
    logistic_type: 'self_service', local_carrier: 'Sur', local_partido: 'San Isidro', shipment_status: 'delivered', created_at_external: '2026-09-30T23:00:00-03:00',
    raw_shipment_json: JSON.stringify({ date_created: '2026-09-30T23:00:00-03:00', status_history: { date_delivered: '2026-10-01T00:30:00-03:00' } }),
    address_json: JSON.stringify({ state: { name: 'Buenos Aires' } }), history_json: '[]', ...overrides };
}
const charge = { package_key: '1:99', carrier_name: 'Sur', zone: 'GBA 1', amount_cents: 300000 };
test('rates use delivery date and exclude future schedules', () => {
  assert.equal(applicableRate(rates, 'Sur', 'GBA 1', '2026-09-30').id, 1);
  assert.equal(applicableRate(rates, 'Sur', 'GBA 1', '2026-10-01').id, 2);
  assert.equal(applicableRate(rates, 'Sur', 'GBA 2', '2026-10-01'), null);
  assert.equal(applicableRate(rates, 'Sur', 'GBA 1', ''), null);
});
test('currency inputs distinguish missing, invalid and explicit zero', () => {
  assert.equal(moneyCents(''), null); assert.equal(moneyCents(-1), null);
  assert.equal(moneyCents('0'), 0); assert.equal(moneyCents('12.34'), 1234);
  assert.equal(validDate('2026-02-30'), false); assert.equal(validDate('2026-99-99'), false); assert.equal(validDate('2026-10-01'), true);
});
test('Colecta uses matching seller cost, never receiver or another seller', () => {
  const costs = { receiver: { cost: 1000 }, senders: [{ user_id: 321, cost: 900 }, { user_id: 123, cost: 350 }] };
  assert.equal(sellerShippingCost(costs, '123'), 35000);
  assert.equal(sellerShippingCost(costs, '555'), null);
  assert.equal(sellerShippingCost({ senders: [{ user_id: 123, cost: 0 }] }, '123'), 0);
});
test('Argentina date is delivery date, not UTC or sync date', () => {
  assert.equal(packageFromOrder(order()).deliveryDate, '2026-10-01');
  assert.equal(packageFromOrder(order({ raw_shipment_json: JSON.stringify({ status_history: { date_delivered: '2026-10-01T01:00:00Z' } }) })).deliveryDate, '2026-09-30');
});
test('two orders in one package sum sales but count one shipment and cost', () => {
  const report = buildFinanceReport({ orders: [order(), order({ order_id: '2', total: '20000' }), order()], rates, charges: [charge] });
  assert.equal(report.totals.salesCents, 3000000); assert.equal(report.totals.packages, 1); assert.equal(report.totals.costCents, 300000);
});
test('same shipment and order IDs on separate accounts remain separate', () => {
  const report = buildFinanceReport({ orders: [order(), order({ integration_connection_id: 2 })], rates, charges: [charge, { ...charge, package_key: '2:99' }] });
  assert.equal(report.totals.packages, 2); assert.equal(report.totals.salesCents, 2000000); assert.equal(report.totals.costCents, 600000);
});
test('historical charges retain carrier, zone and cost despite current assignment and tariff changes', () => {
  const report = buildFinanceReport({ orders: [order({ local_carrier: 'Otro', local_partido: 'Pilar' })], rates: [], charges: [charge] });
  assert.equal(report.packages[0].carrier, 'Sur'); assert.equal(report.packages[0].zone, 'GBA 1'); assert.equal(report.totals.costCents, 300000);
});
test('in-transit packages do not incur Flex cost; delivered missing costs are pending', () => {
  const report = buildFinanceReport({ orders: [order(), order({ order_id: '2', shipment_id: '100', shipment_status: 'shipped' })], rates });
  assert.equal(report.totals.costCents, 0); assert.equal(report.totals.pendingCosts, 1);
});
test('date filter separates sales on sale date and Flex cost on delivery date', () => {
  const report = buildFinanceReport({ orders: [order()], rates, charges: [charge], filters: { from: '2026-10-01', to: '2026-10-01' } });
  assert.equal(report.totals.salesCents, 0); assert.equal(report.totals.costCents, 300000);
});
test('cancelled orders and unknown currencies are not counted as paid ARS sales', () => {
  const report = buildFinanceReport({ orders: [order({ status: 'cancelled' }), order({ order_id: '2', shipment_id: '100', currency: 'USD' })], rates });
  assert.equal(report.totals.salesCents, 0); assert.equal(report.unknownSales, 1);
});
test('Colecta zero cost is known while missing cost is pending', () => {
  const report = buildFinanceReport({ orders: [order({ logistic_type: 'cross_docking' })], rates, costs: [{ connection_id: 1, shipment_id: '99', amount_cents: 0 }] });
  assert.equal(report.totals.pendingCosts, 0); assert.equal(report.packages[0].costCents, 0);
});
test('late delivered shipment remains delivered with independent delay flag', () => {
  const p = packageFromOrder(order({ lead_time_json: JSON.stringify({ estimated_delivery_time: { date: '2026-09-30T23:59:00-03:00' } }) }));
  assert.equal(p.status, 'delivered'); assert.equal(p.delayed, true);
});
test('filters restrict connection, modality, carrier and region', () => {
  const report = buildFinanceReport({ orders: [order()], rates, charges: [charge], filters: { connection: '2' } });
  assert.equal(report.totals.packages, 0); assert.equal(report.totals.salesCents, 0);
});
test('a later return does not erase an earned Flex charge or its delivery date', () => {
  const report = buildFinanceReport({ orders: [order({ shipment_status: 'returned', raw_shipment_json: '{}' })], rates,
    charges: [{ ...charge, delivery_date: '2026-10-01' }], filters: { from: '2026-10-01', to: '2026-10-31' } });
  assert.equal(report.totals.costCents, 300000);
  assert.equal(report.packages[0].deliveryDate, '2026-10-01');
});
test('delivery counts use actual delivery date rather than package creation date', () => {
  const report = buildFinanceReport({ orders: [order()], rates, charges: [charge], filters: { from: '2026-09-01', to: '2026-09-30' } });
  assert.equal(report.totals.delivered, 0);
  assert.equal(report.totals.costCents, 0);
});
test('shared packages use the latest stored shipment state across their orders', () => {
  const report = buildFinanceReport({ orders: [order({ shipment_status: 'shipped', synced_at: '2026-10-01 12:00:00' }), order({ order_id: '2', synced_at: '2026-10-02 12:00:00' })], rates, charges: [charge] });
  assert.equal(report.packages.length, 1);
  assert.equal(report.packages[0].status, 'delivered');
});
test('SQLite migration is additive, idempotent and preserves immutable charges across duplicate writes', async () => {
  const db = createClient({ url: ':memory:' });
  try {
    await db.batch(financeStatements, 'write'); await db.batch(financeStatements, 'write');
    await db.execute("INSERT INTO carrier_rates (workspace_id, carrier_name, zone, effective_from, amount_cents) VALUES (1, 'Sur', 'GBA 1', '2026-10-01', 300000)");
    await assert.rejects(db.execute("INSERT INTO carrier_rates (workspace_id, carrier_name, zone, effective_from, amount_cents) VALUES (1, 'Sur', 'GBA 1', '2026-10-01', 500000)"));
    const insert = "INSERT OR IGNORE INTO flex_delivery_charges (workspace_id, package_key, carrier_name, zone, delivery_date, rate_id, amount_cents) VALUES (1, '1:99', 'Sur', 'GBA 1', '2026-10-01', 1, ?)";
    await db.execute({ sql: insert, args: [300000] }); await db.execute({ sql: insert, args: [500000] });
    const stored = await db.execute('SELECT * FROM flex_delivery_charges');
    assert.equal(stored.rows.length, 1); assert.equal(stored.rows[0].amount_cents, 300000);
  } finally { db.close(); }
});
