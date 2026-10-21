import test from 'node:test';
import assert from 'node:assert/strict';
import { combineZoneSummaries, periodPreset } from '../src/lib/financeMap.js';
import { filterRecords, summarize, groupRecords, shipmentSales } from '../src/lib/logisticsFinance.js';

const records = [
  { zone:'CABA', method:'flex', amountCents:1000, salesCents:10000, paidKnownOrderCount:1, paidOrderCount:1, salesMissingCount:0, dispatchDay:'2026-10-21' },
  { zone:'CABA', method:'flex', amountCents:3000, salesCents:40000, paidKnownOrderCount:2, paidOrderCount:2, salesMissingCount:0, dispatchDay:'2026-10-21' },
  { zone:'GBA 1', method:'colecta', amountCents:10000, salesCents:100000, paidKnownOrderCount:1, paidOrderCount:1, salesMissingCount:0, dispatchDay:'2026-10-20' },
  { zone:'GBA 2', method:'flex', amountCents:null, salesCents:null, paidKnownOrderCount:0, paidOrderCount:1, salesMissingCount:1, dispatchDay:'2026-10-21' },
  { zone:'', method:'flex', amountCents:500, salesCents:5000, paidKnownOrderCount:1, paidOrderCount:1, salesMissingCount:0, dispatchDay:'' },
];

test('map selection sums full zone totals and weights averages by shipments and orders', () => {
  const groups=groupRecords(records,'zone');
  const selected=combineZoneSummaries(groups,['CABA','GBA 1']);
  assert.equal(selected.count,3);
  assert.equal(selected.totalCents,14000);
  assert.equal(selected.salesCents,150000);
  assert.equal(selected.averageCents,4667);
  assert.equal(selected.averageSaleCents,37500);
  assert.equal(selected.logisticsPercent,14000/150000*100);
  const expected=summarize(records);
  const all=combineZoneSummaries(groups);
  for(const key of ['count','knownCount','totalCents','salesCents','averageCents','averageSaleCents','logisticsPercent']) assert.equal(all[key],expected[key],key);
});

test('missing and empty zones remain explicit and do not turn unknown averages into zero', () => {
  const groups=groupRecords(records,'zone');
  const missing=combineZoneSummaries(groups,['GBA 2']);
  assert.equal(missing.count,1);
  assert.equal(missing.averageCents,null);
  assert.equal(missing.averageSaleCents,null);
  assert.equal(missing.salesCents,null);
  assert.equal(missing.logisticsPercent,null);
  assert.equal(combineZoneSummaries(groups,['__missing__']).count,1);
  assert.equal(combineZoneSummaries(groups,['GBA 3']).count,0);
});

test('detail and CSV zone filters match the map selection, including dates and unknown zones', () => {
  const selected=filterRecords(records,{zones:'CABA,GBA 1',from:'2026-10-20',to:'2026-10-21'});
  assert.equal(selected.length,3);
  assert.equal(summarize(selected).salesCents,combineZoneSummaries(groupRecords(records,'zone'),['CABA','GBA 1']).salesCents);
  assert.equal(filterRecords(records,{zones:'CABA,__missing__'}).length,3);
  assert.equal(filterRecords(records,{zones:'GBA 1',method:'flex'}).length,0);
});

test('known paid order count excludes unknown payments from sales averages', () => {
  const sales=shipmentSales([
    {order_id:'1',status:'paid',currency:'ARS',total:'100'},
    {order_id:'2',status:'paid',currency:'ARS',total:null},
    {order_id:'3',status:'cancelled',currency:'ARS',total:'300'},
  ]);
  const summary=summarize([{...sales,amountCents:500}]);
  assert.equal(summary.paidOrderCount,2);
  assert.equal(summary.paidKnownOrderCount,1);
  assert.equal(summary.averageSaleCents,10000);
});

test('date presets respect Argentina midnight and month and year boundaries', () => {
  const now=new Date('2026-01-01T02:30:00Z'); // Still December 31 in Argentina.
  assert.deepEqual(periodPreset('today',now),{from:'2025-12-31',to:'2025-12-31'});
  assert.deepEqual(periodPreset('7',now),{from:'2025-12-25',to:'2025-12-31'});
  assert.deepEqual(periodPreset('previous',new Date('2026-01-10T12:00:00Z')),{from:'2025-12-01',to:'2025-12-31'});
  assert.deepEqual(periodPreset('previous',new Date('2024-03-10T12:00:00Z')),{from:'2024-02-01',to:'2024-02-29'});
  assert.deepEqual(periodPreset('month',now),{from:'2025-12-01',to:'2025-12-31'});
  assert.deepEqual(periodPreset('all',now),{from:'',to:''});
});

test('map shapes resolve to the partido keys stored on shipments', async () => {
  const { shapePartidoKeys, MAP_PARTIDOS } = await import('../src/lib/financeMap.js');
  const shapes = (await import('../src/lib/financeMapShapes.json', { with: { type: 'json' } })).default.shapes;
  const keys = new Set(MAP_PARTIDOS.map((p) => p.key));
  for (const shape of shapes) for (const key of shapePartidoKeys(shape.name)) assert.ok(keys.has(key), `${shape.name} -> ${key}`);
  assert.deepEqual(shapePartidoKeys('Comuna 4'), ['capital_federal']);
  assert.deepEqual(shapePartidoKeys('Tres de Febrero'), ['3_de_febrero']);
  assert.deepEqual(shapePartidoKeys('La Matanza Norte'), ['la_matanza_norte']);
  assert.deepEqual(shapePartidoKeys('La Matanza Sur'), ['la_matanza_sur']);
  assert.ok(!shapes.some((shape) => shape.name === 'La Matanza'));
});

test('partido selection sums partidos and matches detail and CSV filters', () => {
  const rows = [
    { zone: 'GBA 1', partido: 'la_matanza_norte', method: 'flex', amountCents: 1000, salesCents: 10000, paidKnownOrderCount: 1, paidOrderCount: 1, salesMissingCount: 0 },
    { zone: 'GBA 2', partido: 'la_matanza_sur', method: 'flex', amountCents: 3000, salesCents: 20000, paidKnownOrderCount: 1, paidOrderCount: 1, salesMissingCount: 0 },
    { zone: 'GBA 2', partido: 'quilmes', method: 'flex', amountCents: 500, salesCents: 5000, paidKnownOrderCount: 1, paidOrderCount: 1, salesMissingCount: 0 },
    { zone: '', partido: '', method: 'flex', amountCents: null, salesCents: null, paidKnownOrderCount: 0, paidOrderCount: 0, salesMissingCount: 0 },
  ];
  const groups = groupRecords(rows, 'partido');
  const picked = combineZoneSummaries(groups, ['la_matanza_norte', 'la_matanza_sur']);
  assert.equal(picked.count, 2);
  assert.equal(picked.salesCents, 30000);
  assert.equal(picked.averageCents, 2000);
  const filtered = filterRecords(rows, { partidos: 'la_matanza_norte,la_matanza_sur' });
  assert.equal(summarize(filtered).totalCents, picked.totalCents);
  assert.equal(filterRecords(rows, { partidos: 'quilmes,__missing__' }).length, 2);
});

test('province names from Mercado Libre, labels and Zipnova fold into one key per province', async () => {
  const { provinceKey, PROVINCE_LABELS } = await import('../src/lib/financeMap.js');
  assert.equal(provinceKey('Capital Federal'), 'caba');
  assert.equal(provinceKey('Ciudad Autónoma de Buenos Aires'), 'caba');
  assert.equal(provinceKey('Provincia de Buenos Aires'), 'buenos_aires');
  assert.equal(provinceKey('Córdoba'), 'cordoba');
  assert.equal(provinceKey('Tierra del Fuego, Antártida e Islas del Atlántico Sur'), 'tierra_del_fuego');
  assert.equal(provinceKey(''), '');
  const provinces = (await import('../src/lib/financeProvinceShapes.json', { with: { type: 'json' } })).default.shapes;
  assert.equal(provinces.length, 24);
  for (const shape of provinces) assert.ok(PROVINCE_LABELS[provinceKey(shape.name)], shape.name);
});

test('province filter matches the map selection, including unknown provinces', () => {
  const rows = [{ province: 'cordoba' }, { province: 'santa_fe' }, { province: '' }];
  assert.equal(filterRecords(rows, { provinces: 'cordoba,__missing__' }).length, 2);
});
