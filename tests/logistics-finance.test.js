import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tiendanubeFinanceRecords, tiendanubeShippingAmounts } from '../src/lib/tiendanubeFinance.js';
import { FINANCE_SCHEMA } from '../src/lib/financeSchema.js';
import { createFinanceRepository } from '../src/lib/financeRepository.js';
import { internalDispatchDay, deliveryFacts, financeRecord, sellerCost, summarize, groupRecords, chooseRate, validDate, csv, preserveMercadoLibreDetails, shipmentFinanceStatement, orderSales, shipmentSales, settlementMatrix, settlementMatrixCsv } from '../src/lib/logisticsFinance.js';

test('sales use paid ARS gross totals, keeping zero, unknown and cancellation distinct', () => {
  assert.equal(orderSales({status:'paid',currency:'ARS',total:'0'}).salesCents,0);
  assert.equal(orderSales({status:'paid',currency:'ARS',total:''}).salesCents,null);
  assert.equal(orderSales({status:'paid',currency:'USD',total:'100'}).salesCents,null);
  assert.equal(orderSales({status:'confirmed',currency:'ARS',total:'100'}).salesCents,null);
  assert.equal(orderSales({status:'cancelled',currency:'ARS',total:'100'}).salesCents,0);
  assert.equal(orderSales({status:'paid',currency:'ARS',total:'-1'}).salesCents,null);
  assert.equal(orderSales({raw_order_json:JSON.stringify({status:'paid',currency_id:'ARS',total_amount:125.50,paid_amount:150})}).salesCents,12550);
});

test('Tiendanube checkout shipping preserves zero, unknown and seller/customer amounts separately', () => {
  assert.deepEqual(tiendanubeShippingAmounts({shipping_cost_customer: '1000', shipping_cost_owner: '850.50'}),
    {shippingCostCustomer: '1000', shippingCostOwner: '850.5'});
  assert.deepEqual(tiendanubeShippingAmounts({shipping_cost_customer: 0}),
    {shippingCostCustomer: '0', shippingCostOwner: null});
  assert.deepEqual(tiendanubeShippingAmounts({shipping_cost_customer: -1, shipping_cost_owner: ''}),
    {shippingCostCustomer: null, shippingCostOwner: null});
  const order = {tiendanube_id: '1', external_store_id: 'store', payment_status: 'paid', status: 'closed',
    currency: 'ARS', total: '11000', shipping_cost_customer: '1000', shipping_cost_owner: '850.50',
    shipping_address_json: JSON.stringify({city: 'Palermo', province: 'Capital Federal'})};
  const [row] = tiendanubeFinanceRecords([order]);
  assert.equal(row.salesCents, 1000000); // Total already includes customer shipping.
  assert.equal(row.shippingCollectedCents, 100000);
  assert.equal(row.amountCents, 85050);
  assert.equal(row.dispatchDay, ''); // Do not invent dispatch dates from creation/payment.
  assert.equal(row.feesCents, null); // Mercado Libre fees are not Tiendanube fees.
  assert.equal(tiendanubeFinanceRecords([{...order, shipping_cost_owner: null}])[0].amountCents, null);
  assert.equal(tiendanubeFinanceRecords([{...order, shipping_cost_customer: null}])[0].salesCents, null);
  assert.equal(tiendanubeFinanceRecords([{...order, currency: 'USD'}])[0].shippingCollectedCents, null);
  assert.equal(tiendanubeFinanceRecords([{...order, payment_status: 'pending'}]).length, 0);
  assert.equal(tiendanubeFinanceRecords([{...order, status: 'cancelled'}]).length, 0);
  assert.equal(tiendanubeFinanceRecords([{...order, order_source: 'meli'}]).length, 0);
  assert.equal(tiendanubeFinanceRecords([{...order, shipping_address_json: '{}'}]).length, 0);
  assert.equal(tiendanubeFinanceRecords([{...order, synced_at:'2026-10-22', status:'cancelled'}, {...order, synced_at:'2026-10-21'}]).length, 0);
  assert.equal(tiendanubeFinanceRecords([order, order, {...order, external_store_id:'another-store'}]).length, 2);
});

test('sales sum separate orders in a package once across duplicate connections', () => {
  const sale = {status:'paid',currency:'ARS',total:'100',order_id:'O1'};
  const combined = shipmentSales([sale,{...sale,integration_connection_id:20},{...sale,order_id:'O2',total:'50'}]);
  assert.equal(combined.salesCents,15000);
  assert.equal(combined.paidOrderCount,2);
  const partial = shipmentSales([sale,{...sale,order_id:'O2',total:''}]);
  assert.equal(partial.salesCents,10000);
  assert.equal(partial.salesMissingCount,1);
  // Use the latest status rather than resurrecting an older paid copy.
  assert.equal(shipmentSales([{...sale,status:'cancelled'},sale]).salesCents,0);
});

test('cost to sales ratio compares complete packages and group totals reconcile', () => {
  const rows = [
    {zone:'CABA',amountCents:1000,salesCents:10000,paidOrderCount:2,salesMissingCount:0},
    {zone:'GBA 1',amountCents:null,salesCents:20000,paidOrderCount:1,salesMissingCount:0},
    {zone:'CABA',amountCents:500,salesCents:5000,paidOrderCount:1,salesMissingCount:1},
    {zone:'GBA 1',amountCents:250,salesCents:null,paidOrderCount:1,salesMissingCount:1},
  ];
  const summary = summarize(rows);
  assert.equal(summary.salesCents,35000);
  assert.equal(summary.logisticsPercent,10);
  assert.equal(summary.comparableCount,1);
  assert.equal(summary.salesMissingCount,2);
  assert.equal(summary.salesUnavailableCount,1);
  assert.equal(groupRecords(rows,'zone').reduce((n,g)=>n+(g.salesCents || 0),0),summary.salesCents);
  assert.equal(summarize([]).salesCents,null);
  assert.equal(summarize([{amountCents:10,salesCents:0}]).logisticsPercent,null);
});

const base = {
  workspace_id:1, integration_connection_id:10, shipment_id:'S1', order_id:'O1', user_id:'555',
  logistic_type:'self_service', shipping_method:'flex', shipment_status:'delivered', shipment_substatus:'',
  carrier_id:1, assigned_carrier:'uno', carrier_display_name:'Uno', partido:'capital_federal',
  raw_shipment_json:JSON.stringify({ status_history:{date_shipped:'2026-10-01T12:00:00-03:00', date_delivered:'2026-10-04T15:00:00-03:00'} }),
};
const rates = [{id:1,carrier_id:1,zone:'CABA',valid_from:'2026-10-01',amount_cents:10000}, {id:2,carrier_id:1,zone:'CABA',valid_from:'2026-10-03',amount_cents:20000}];

test('Flex uses dispatch-day rate even when delivered after increase', () => {
  const record = financeRecord(base, rates);
  assert.equal(record.amountCents,10000);
  assert.equal(record.rateId,1);
  assert.equal(chooseRate(rates,{carrierId:1,zone:'CABA',dispatchDay:'2026-09-30'}),null);
  assert.equal(financeRecord({...base,raw_shipment_json:'{}'}, rates).amountCents,null);
});
test('Colecta distinguishes seller zero cost from missing data and ignores receiver', () => {
  assert.equal(sellerCost({receiver:{cost:400},senders:[{user_id:555,cost:0}]},555),0);
  assert.equal(sellerCost({receiver:{cost:400},senders:[{user_id:999,cost:100}]},555),null);
  assert.equal(sellerCost({senders:[{user_id:555,cost:null}]},555),null);
});
test('delivery status and delay flags remain independent; completed delays resolve', () => {
  const row={...base,shipment_status:'shipped',shipment_substatus:'out_for_delivery',delays_json:JSON.stringify({delay:[{date_delayed_begin:'2026-10-01'}]})};
  const facts=deliveryFacts(row,new Date('2026-10-02T12:00:00Z'));
  assert.equal(facts.state,'out_for_delivery'); assert.equal(facts.delayed,true);
  assert.equal(deliveryFacts({...row,delays_json:JSON.stringify({delay:[{date_delayed_end:'2026-10-01'}]})}).delayed,false);
  assert.equal(deliveryFacts({...row,shipment_status:'delivered'}).delayed,false);
  assert.equal(deliveryFacts({...row,shipment_substatus:'receiver_absent'}).state,'attempt');
});
test('date-only ETA expires after Argentina day ends; missing ETA is not overdue', () => {
  const row={...base,shipment_status:'shipped',lead_time_json:JSON.stringify({estimated_delivery_time:{date:'2026-10-02'}})};
  assert.equal(deliveryFacts(row,new Date('2026-10-03T02:59:00Z')).overdue,false);
  assert.equal(deliveryFacts(row,new Date('2026-10-03T03:01:00Z')).overdue,true);
  assert.equal(deliveryFacts({...row,lead_time_json:'{}'}).overdue,false);
  assert.equal(validDate('2026-02-30'),false);
});
test('group totals reconcile and unknown costs do not reduce average', () => {
  const rows=[financeRecord(base,rates),financeRecord({...base,shipment_id:'S2',partido:'quilmes'},rates)];
  const total=summarize(rows);
  assert.equal(total.count,2); assert.equal(total.missingCount,1); assert.equal(total.averageCents,10000);
  assert.equal(groupRecords(rows,'zone').reduce((n,g)=>n+g.totalCents,0),total.totalCents);
  assert.equal(groupRecords(rows,'partido').reduce((n,g)=>n+g.totalCents,0),total.totalCents);
  assert.match(csv([{name:'=CMD()'}],[['Nombre','name']]), /'=CMD/);
});
test('light and failed detail refreshes preserve last valid data; successful empty results clear old delays',()=>{
  const old={raw_shipment_json:'{"status":"shipped"}',lead_time_json:'{"cost":50}',delays_json:'{"delay":[{"id":"old"}]}',history_json:'[{"status":"shipped"}]',carrier_json:'{"id":1}'};
  const merged=preserveMercadoLibreDetails({order:{id:'O1'},light:true},old);
  assert.equal(merged.shipment.status,'shipped');
  assert.equal(merged.history.length,1);
  assert.equal(merged.leadTime.cost,50);
  assert.equal(merged.delays.delay.length,1);
  assert.equal(preserveMercadoLibreDetails({delays:null,history:[]},old).delays,null);
  assert.equal(preserveMercadoLibreDetails({delays:null,history:[]},old).history.length,0);
});
test('canceled Flex never adds expense while Colecta retains a real seller charge',()=>{
  const flex=financeRecord({...base,shipment_status:'cancelled'},rates);
  assert.equal(flex.amountCents,null);
  const colecta=financeRecord({...base,shipment_status:'cancelled',logistic_type:'cross_docking',shipping_method:'colecta',costs_json:JSON.stringify({senders:[{user_id:555,cost:10}]})},rates);
  assert.equal(colecta.amountCents,1000);
});

async function fixture() {
  const directory=mkdtempSync(join(tmpdir(),'logistics-finance-'));
  const filename=join(directory,'test.db');
  const db=createClient({url:pathToFileURL(filename).href});
  await db.batch([
    `CREATE TABLE carriers(id INTEGER PRIMARY KEY,workspace_id INTEGER,name TEXT,display_name TEXT)`,
    `CREATE TABLE shipments(id INTEGER PRIMARY KEY,workspace_id INTEGER,partido TEXT,assigned_carrier TEXT,external_shipment_id TEXT,integration_connection_id INTEGER,shipping_method TEXT)`,
    `CREATE TABLE mercadolibre_orders(id INTEGER PRIMARY KEY,workspace_id INTEGER,integration_connection_id INTEGER,shipment_id TEXT,order_id TEXT,user_id TEXT,external_store_id TEXT,logistic_type TEXT,shipping_method TEXT,shipment_status TEXT,shipment_substatus TEXT,raw_shipment_json TEXT,lead_time_json TEXT,history_json TEXT,delays_json TEXT,address_json TEXT,shipment_row_id INTEGER,synced_at TEXT,recipient_name TEXT,label_printed_at TEXT,label_imported_at TEXT)`,
    `CREATE TABLE audit_logs(id INTEGER PRIMARY KEY,workspace_id INTEGER,app_user_id INTEGER,actor_type TEXT,action TEXT,entity_type TEXT,entity_id TEXT,metadata_json TEXT)`,
    ...FINANCE_SCHEMA,
    "INSERT INTO carriers VALUES(1,0,'uno','Uno')",
    "INSERT INTO shipments VALUES(1,1,'capital_federal','uno','S1',10,'flex')",
    {sql:`INSERT INTO mercadolibre_orders(id,workspace_id,integration_connection_id,shipment_id,order_id,user_id,logistic_type,shipping_method,shipment_status,raw_shipment_json,shipment_row_id,synced_at) VALUES(1,1,10,'S1','O1','555','self_service','flex','delivered',?,1,CURRENT_TIMESTAMP)`,args:[base.raw_shipment_json]},
    // Two sales, and a second connection, still represent one physical package.
    `INSERT INTO mercadolibre_orders SELECT 2,workspace_id,integration_connection_id,shipment_id,'O2',user_id,external_store_id,logistic_type,shipping_method,shipment_status,shipment_substatus,raw_shipment_json,lead_time_json,history_json,delays_json,address_json,shipment_row_id,synced_at,recipient_name,label_printed_at,label_imported_at FROM mercadolibre_orders WHERE id=1`,
  ],'write');
  for (const column of ['status','currency','total','raw_order_json','carrier_json','printed_label_zpl','pack_id','buyer_nickname']) {
    await db.execute(`ALTER TABLE mercadolibre_orders ADD COLUMN ${column} TEXT`);
  }
  await db.execute('ALTER TABLE shipments ADD COLUMN raw_zpl TEXT');
  await db.execute('CREATE TABLE daily_batches(id INTEGER PRIMARY KEY,workspace_id INTEGER,date TEXT)');
  for (const column of ['tracking_number','dispatch_date','created_at','status','batch_id','province']) await db.execute(`ALTER TABLE shipments ADD COLUMN ${column} TEXT`);
  await db.execute('ALTER TABLE shipments ADD COLUMN recipient_name TEXT');
  await db.execute(`CREATE TABLE tiendanube_orders(id INTEGER PRIMARY KEY,workspace_id INTEGER,integration_connection_id INTEGER,
    external_store_id TEXT,tiendanube_id BIGINT,status TEXT,payment_status TEXT,shipping_status TEXT,dispatch_status TEXT,
    dispatch_marked_at TEXT,dispatched_at_external TEXT,contact_name TEXT,shipping_address_json TEXT,total TEXT,currency TEXT,
    shipping_cost_customer TEXT,shipping_cost_owner TEXT,order_source TEXT,synced_at TEXT)`);
  const repo=createFinanceRepository(db);
  await repo.saveRate(1,{carrierId:1,zone:'CABA',validFrom:'2026-10-01',amountCents:10000},7);
  await repo.saveRate(2,{carrierId:1,zone:'CABA',validFrom:'2026-10-01',amountCents:30000},8);
  // The native Windows driver can retain file handles until process exit.
  // Keep disposable test databases in the OS temp directory.
  const cleanup=()=>db.close();
  return {db,repo,cleanup};
}
test('schema migrations are repeatable, records deduplicate, workspace rates isolate',async()=>{
  const {db,repo,cleanup}=await fixture();
  try {
    await db.batch(FINANCE_SCHEMA,'write');
    assert.equal((await repo.records(1)).length,1);
    assert.equal((await repo.report(1,{})).summary.totalCents,10000);
    assert.equal((await repo.listRates(2))[0].amount_cents,30000);
    assert.equal((await repo.records(2)).length,0);
    await assert.rejects(repo.settlementDetail(2,1),/no encontrada/);
  } finally {cleanup();}
});

test('report preserves all package sales while charging one physical shipment',async()=>{
  const {db,repo,cleanup}=await fixture();
  try {
    await db.execute("UPDATE mercadolibre_orders SET status='paid',currency='ARS',total=CASE order_id WHEN 'O1' THEN '1000' ELSE '500' END");
    await db.execute(`INSERT INTO mercadolibre_orders(id,workspace_id,integration_connection_id,shipment_id,order_id,user_id,logistic_type,shipping_method,shipment_status,raw_shipment_json,shipment_row_id,synced_at,status,currency,total)
      SELECT 3,workspace_id,20,shipment_id,order_id,user_id,logistic_type,shipping_method,shipment_status,raw_shipment_json,shipment_row_id,synced_at,status,currency,total FROM mercadolibre_orders WHERE id=1`);
    const report=await repo.report(1,{});
    assert.equal(report.rows.length,1);
    assert.equal(report.summary.salesCents,150000);
    assert.equal(report.summary.paidOrderCount,2);
    assert.equal(report.summary.totalCents,10000);
    assert.equal(report.byZone[0].salesCents,150000);
    assert.equal(report.byPartido[0].salesCents,150000);
    const compact=await repo.report(1,{}, { compact:true });
    assert.equal(compact.rows,undefined);
    assert.deepEqual(compact.summary,report.summary);
    assert.equal(compact.summary.averageSaleCents,75000);
    // The Detalle tab reads its rows from the same snapshot, with the same figures as the full calculation.
    const detail=await repo.report(1,{}, { withRows:true });
    assert.deepEqual(detail.summary,report.summary);
    assert.deepEqual(detail.rows.map(r=>[r.shipmentId,r.amountCents,r.salesCents,r.zone,r.sellerId,r.recipient]),report.rows.map(r=>[r.shipmentId,r.amountCents,r.salesCents,r.zone,r.sellerId,r.recipient]));
    assert.equal((await repo.report(2,{})).summary.salesCents,null);
    assert.equal((await repo.report(1,{from:'2026-10-02'})).summary.salesCents,null);
  } finally {cleanup();}
});

test('large histories exclude labels, retry oversized pages, and keep complete totals',async()=>{
  const {db,cleanup}=await fixture();
  try {
    const label='^XA'+'x'.repeat(30000)+'^XZ';
    const raw=JSON.stringify({total_amount:100,status:'paid',currency_id:'ARS',unused:'x'.repeat(30000)});
    const inserts=[];
    for(let i=0;i<205;i++) inserts.push({
      sql:`INSERT INTO mercadolibre_orders(id,workspace_id,integration_connection_id,shipment_id,order_id,user_id,
        logistic_type,shipping_method,shipment_status,raw_shipment_json,synced_at,status,currency,total,raw_order_json,printed_label_zpl)
        VALUES(?,1,10,?,?,'555','self_service','flex','delivered',?,'2026-10-21 12:00:00','paid','ARS','100',?,?)`,
      args:[i+10,`S${i+10}`,`O${i+10}`,base.raw_shipment_json,raw,label],
    });
    for(let i=0;i<235;i++) inserts.push({
      sql:"INSERT INTO shipments(id,workspace_id,partido,assigned_carrier,shipping_method,raw_zpl,recipient_name) VALUES(?,1,'capital_federal','uno','flex',?,'Destinatario local')",
      args:[i+10,label],
    });
    await db.batch(inserts,'write');
    await db.execute("UPDATE mercadolibre_orders SET status='paid',currency='ARS',total='100' WHERE id IN (1,2)");
    await db.execute({
      sql:`INSERT INTO mercadolibre_orders(id,workspace_id,integration_connection_id,shipment_id,order_id,user_id,
        logistic_type,shipping_method,shipment_status,raw_shipment_json,synced_at,status,currency,total)
        VALUES(300,1,20,'S1','O1','555','self_service','flex','delivered',?,'1970-01-01','cancelled','ARS','100')`,
      args:[base.raw_shipment_json],
    });
    let oversizeRetries=0;
    const seen=[];
    const boundedDb={execute:async(statement)=>{
      const result=await db.execute(statement);
      if(/FROM mercadolibre_orders mo|FROM shipments s/.test(statement.sql)) {
        assert.match(statement.sql,/LIMIT \?/);
        for(const row of result.rows) {
          assert.equal(row.printed_label_zpl,undefined);
          assert.equal(row.raw_zpl,undefined);
          if(row.raw_order_json) assert.equal(JSON.parse(row.raw_order_json).unused,undefined);
        }
        if(Buffer.byteLength(JSON.stringify(result.rows))>18000) {
          oversizeRetries++;
          throw Object.assign(new Error('Response is too large'),{code:'RESPONSE_TOO_LARGE'});
        }
        seen.push(...result.rows.map(r=>r.id));
      }
      return result;
    }};
    const report=await createFinanceRepository(boundedDb).report(1,{});
    assert.ok(oversizeRetries>0);
    assert.ok(seen.length>400);
    assert.equal(report.rows.length,441); // 206 physical ML shipments + 235 local shipments.
    assert.equal(report.summary.paidOrderCount,207); // The older O1 copy is on a different page.
    assert.equal(report.summary.salesCents,2070000);
    assert.equal(report.summary.totalCents,10000);
    assert.equal(report.byZone.reduce((n,g)=>n+(g.salesCents||0),0),2070000);
    assert.equal(report.rows.find(r=>r.shipmentId==='local:244').recipient,'Destinatario local');
    await assert.rejects(createFinanceRepository({execute:async()=>{throw new Error('Database unavailable');}}).records(1),/Database unavailable/);
  } finally {cleanup();}
});
test('closure freezes rate, snapshots responsibility and prevents duplicate settlement',async()=>{
  const {db,repo,cleanup}=await fixture();
  try {
    await repo.captureResponsibilities(1);
    await db.execute("UPDATE shipments SET assigned_carrier='otro',partido='quilmes' WHERE id=1");
    const first=await repo.createSettlement(1,{carrierId:1,from:'2026-10-01',to:'2026-10-31'},7);
    const second=await repo.createSettlement(1,{carrierId:1,from:'2026-10-01',to:'2026-10-31'},7);
    // The draft preview read from the snapshot matches the full calculation used at closing.
    const preview=await repo.settlementDetail(1,first,undefined,{fast:true}), full=await repo.settlementDetail(1,first);
    assert.deepEqual(preview.items.map(i=>[i.shipmentId,i.amountCents,i.zone,i.deliveryDay]),full.items.map(i=>[i.shipmentId,i.amountCents,i.zone,i.deliveryDay]));
    assert.equal(preview.totalCents,10000);
    assert.deepEqual(preview.excluded,{});
    await repo.mutateSettlement(1,first,'close',{},7);
    assert.equal((await repo.settlementDetail(1,first)).totalCents,10000);
    await assert.rejects(repo.mutateSettlement(1,second,'close',{},7),/No hay entregados/);
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM carrier_settlement_items')).rows[0].n,1);
    // A historical tariff added later cannot rewrite a closed statement.
    await repo.saveRate(1,{carrierId:1,zone:'CABA',validFrom:'2026-09-01',amountCents:90000},7);
    assert.equal((await repo.records(1))[0].amountCents,10000);
    await repo.mutateSettlement(1,first,'adjust',{amountCents:-1000,reason:'Corrección documentada'},7);
    assert.equal((await repo.settlementDetail(1,first)).totalCents,9000);
    await repo.mutateSettlement(1,first,'pay',{paidAt:'2026-10-13',reference:'TX-1'},7);
    assert.equal((await repo.settlementDetail(1,first)).settlement.status,'paid');
    await assert.rejects(repo.mutateSettlement(1,first,'adjust',{amountCents:1,reason:'Cambio'},7),/todavía no pagada/);
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM audit_logs')).rows[0].n,3);
  } finally {cleanup();}
});
test('database uniqueness rejects overlapping claims even without application filtering',async()=>{
  const {db,repo,cleanup}=await fixture();
  try {
    await repo.createSettlement(1,{carrierId:1,from:'2026-10-01',to:'2026-10-31'},7);
    const insert=`INSERT INTO carrier_settlement_items(settlement_id,workspace_id,connection_id,shipment_id,amount_cents,snapshot_json) VALUES(1,1,?,'S1',10000,'{}')`;
    await db.execute({sql:insert,args:[10]});
    await assert.rejects(db.execute({sql:insert,args:[11]}),/UNIQUE/);
  } finally {cleanup();}
});
test('simultaneous closures can claim a physical shipment only once',async()=>{
  const {db,repo,cleanup}=await fixture();
  try {
    const first=await repo.createSettlement(1,{carrierId:1,from:'2026-10-01',to:'2026-10-31'},7);
    const second=await repo.createSettlement(1,{carrierId:1,from:'2026-10-01',to:'2026-10-31'},7);
    const results=await Promise.allSettled([repo.mutateSettlement(1,first,'close',{},7),repo.mutateSettlement(1,second,'close',{},7)]);
    assert.equal(results.filter((r)=>r.status==='fulfilled').length,1);
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM carrier_settlement_items')).rows[0].n,1);
    assert.equal((await db.execute("SELECT COUNT(*) AS n FROM carrier_settlements WHERE status='closed'")).rows[0].n,1);
  } finally {cleanup();}
});
test('concurrent partial captures preserve unrelated detail and known costs; errors stay visible',async()=>{
  const {db,cleanup}=await fixture();
  try {
    const order={id:'O1',shipping:{id:'S1'}};
    await db.execute(shipmentFinanceStatement(1,{order,shipment:{id:'S1'},history:[{status:'shipped'}],delays:{delay:[{id:'old'}]},costs:{senders:[{user_id:555,cost:0}]}},10,'2026-10-13T12:00:00Z'));
    await Promise.all([
      db.execute(shipmentFinanceStatement(1,{order,leadTime:{estimated_delivery_time:{date:'2026-10-15'}},syncErrors:['Historial: error']},10)),
      db.execute(shipmentFinanceStatement(1,{order,shipment:{id:'S1',status:'shipped'},light:true},10)),
    ]);
    let row=(await db.execute('SELECT * FROM shipment_finance WHERE workspace_id=1')).rows[0];
    let details=JSON.parse(row.details_json);
    assert.equal(details.history.length,1);
    assert.equal(details.leadTime.estimated_delivery_time.date,'2026-10-15');
    assert.equal(sellerCost(JSON.parse(row.costs_json),555),0);
    assert.match(row.sync_error,/Historial/);
    assert.equal(row.details_synced_at,'2026-10-13T12:00:00Z');
    await db.execute(shipmentFinanceStatement(1,{order,delays:null},10));
    row=(await db.execute('SELECT * FROM shipment_finance WHERE workspace_id=1')).rows[0];
    details=JSON.parse(row.details_json);
    assert.equal(details.delays,null);
    assert.equal(details.history.length,1);
    assert.equal(row.sync_error,null);
    await db.execute(shipmentFinanceStatement(2,{order,costs:{senders:[{user_id:555,cost:20}]}},10));
    assert.equal(sellerCost(JSON.parse((await db.execute('SELECT costs_json FROM shipment_finance WHERE workspace_id=1')).rows[0].costs_json),555),0);
  } finally {cleanup();}
});

test('saving a rate again with the same date corrects it and reprices open shipments',async()=>{
  const {repo,cleanup}=await fixture();
  try {
    assert.equal((await repo.report(1,{})).summary.totalCents,10000);
    await repo.saveRate(1,{carrierId:1,zone:'CABA',validFrom:'2026-10-01',amountCents:25000},7);
    assert.equal((await repo.listRates(1)).length,1);
    assert.equal((await repo.report(1,{})).summary.totalCents,25000);
    await repo.saveRate(1,{carrierId:1,zone:'CABA',validFrom:'2026-09-01',amountCents:5000},7);
    assert.equal((await repo.listRates(1)).length,2);
  } finally { cleanup(); }
});

test('Mercado Libre fees are deducted once and aggregate balance keeps all known sales',()=>{
  const raw=(fee)=>JSON.stringify({id:1,status:'paid',currency_id:'ARS',total_amount:1000,order_items:[{quantity:2,sale_fee:fee}]});
  const ok=shipmentSales([{order_id:'1',status:'paid',currency:'ARS',raw_order_json:raw(100)}]);
  assert.equal(ok.feesCents,20000);
  assert.equal(ok.netCents,100000-20000);
  const missing=shipmentSales([{order_id:'3',status:'paid',currency:'ARS',raw_order_json:raw(100)},{order_id:'2',status:'paid',currency:'ARS',raw_order_json:JSON.stringify({id:2,total_amount:500,order_items:[{quantity:1}]})}]);
  assert.equal(missing.netCents,null);
  assert.equal(missing.feesMissingCount,1);
  const s=summarize([{...ok,amountCents:5000},{...missing,amountCents:1000}]);
  assert.equal(s.feesCents,40000);
  assert.equal(s.netCents,210000);
  assert.equal(s.netAfterShippingCents,204000);
  assert.equal(s.feesUnavailableCount,1);
});

test('snapshot report matches the full calculation and follows rate changes without rebuilding',async()=>{
  const {repo,cleanup}=await fixture();
  try {
    const full=await repo.report(1,{from:'2026-10-01',to:'2026-10-31'});
    const fast=await repo.report(1,{from:'2026-10-01',to:'2026-10-31'},{compact:true});
    for (const key of ['count','totalCents','salesCents','feesCents','netCents','missingCount']) assert.equal(fast.summary[key],full.summary[key],key);
    assert.ok(fast.snapshotAt);
    await repo.saveRate(1,{carrierId:1,zone:'CABA',validFrom:'2026-10-01',amountCents:77700},7);
    const after=await repo.report(1,{},{compact:true});
    assert.equal(after.snapshotAt,fast.snapshotAt);
    assert.equal(after.summary.totalCents,77700);
  } finally { cleanup(); }
});

test('dispatch and delivery dates are read from the Mercado Libre date_history block',()=>{
  const facts=deliveryFacts({...base,shipment_status:'delivered',history_json:JSON.stringify({date_history:{date_shipped:'2026-10-05T10:00:00.000-03:00',date_delivered:'2026-10-05T18:30:00.000-03:00',date_ready_to_ship:'2026-10-04T20:00:00.000-03:00',date_delivered_estimated:null},substatus:null})});
  assert.equal(facts.dispatchDay,'2026-10-05');
  assert.equal(facts.deliveryDay,'2026-10-05');
  assert.ok(facts.history.some((e)=>e.status==='ready_to_ship'));
  const pending=deliveryFacts({...base,shipment_status:'ready_to_ship',history_json:JSON.stringify({date_history:{date_shipped:null,date_ready_to_ship:'2026-10-04T20:00:00.000-03:00'}})});
  assert.equal(pending.dispatchDay,'');
});

test('internal dispatch labels get the year closest to when the shipment was created',()=>{
  assert.equal(internalDispatchDay('30 SEP','2026-09-30 14:15:30'),'2026-09-30');
  assert.equal(internalDispatchDay('jueves 10/sep','2026-09-08 10:00:00'),'2026-09-10');
  assert.equal(internalDispatchDay('02 JAN','2026-12-30 10:00:00'),'2027-01-02');
  assert.equal(internalDispatchDay('01 APR','2026-03-31 10:00:00'),'2026-04-01');
  assert.equal(internalDispatchDay('sin fecha','2026-10-05 10:00:00'),'2026-10-05');
  assert.equal(internalDispatchDay('',''),'');
});

test('flex shipments never matched to Mercado Libre are dated and priced from the app data',async()=>{
  const {db,repo,cleanup}=await fixture();
  try {
    await db.execute("INSERT INTO shipments(id,workspace_id,partido,assigned_carrier,shipping_method,tracking_number,dispatch_date,created_at,status) VALUES(5,1,'capital_federal','uno','flex','T9','05 OCT','2026-10-05 10:00:00','pendiente')");
    const local=(await repo.records(1)).find((r)=>String(r.shipmentId)==='local:5');
    assert.equal(local.dispatchDay,'2026-10-05');
    assert.equal(local.zone,'CABA');
    assert.equal(local.amountCents,10000);
    assert.equal((await repo.report(1,{from:'2026-10-01',to:'2026-10-31'})).summary.count,2);
  } finally { cleanup(); }
});

test('the daily batch date is the dispatch day for internal shipments, like the dashboard',async()=>{
  const {db,repo,cleanup}=await fixture();
  try {
    await db.execute("INSERT INTO daily_batches(id,workspace_id,date) VALUES(1,1,'2026-10-06')");
    await db.execute("INSERT INTO shipments(id,workspace_id,partido,assigned_carrier,shipping_method,tracking_number,dispatch_date,created_at,batch_id) VALUES(6,1,'capital_federal','uno','flex','T10','05 OCT','2026-10-05 10:00:00',1)");
    await db.execute("INSERT INTO shipments(id,workspace_id,partido,shipping_method,tracking_number,created_at,batch_id) VALUES(7,1,'lanus','colecta','T11','2026-10-05 10:00:00',1)");
    const records=await repo.records(1);
    assert.equal(records.find((r)=>r.shipmentId==='local:6').dispatchDay,'2026-10-06');
    const colecta=records.find((r)=>r.shipmentId==='local:7');
    assert.equal(colecta.method,'colecta');
    assert.equal(colecta.amountCents,null);
  } finally { cleanup(); }
});

test('Zipnova is excluded, and a coordinar sales retain their own unknown shipping cost',async()=>{
  const {db,repo,cleanup}=await fixture();
  try {
    await db.execute(`CREATE TABLE zipnova_shipments(id INTEGER PRIMARY KEY,workspace_id INTEGER,zipnova_id TEXT,created_date TEXT,status TEXT,status_name TEXT,province TEXT,city TEXT,recipient_name TEXT,price FLOAT,declared_value FLOAT,carrier_name TEXT)`);
    await db.execute({sql:`INSERT INTO mercadolibre_orders(id,workspace_id,integration_connection_id,shipment_id,order_id,user_id,status,currency,raw_order_json,synced_at) VALUES(9,1,10,NULL,'O9','555','paid','ARS',?,CURRENT_TIMESTAMP)`,
      args:[JSON.stringify({id:9,status:'paid',currency_id:'ARS',total_amount:2000,date_created:'2026-10-04T10:00:00.000-03:00',buyer:{first_name:'Juan',last_name:'Pérez'},order_items:[{quantity:1,sale_fee:300}]})]});
    await db.execute("INSERT INTO zipnova_shipments VALUES(1,1,'Z1','2026-10-06','delivered','Entregado','Córdoba','Córdoba','Juan Perez',15000,2000,'Urbano')");
    await db.execute("INSERT INTO zipnova_shipments VALUES(2,1,'Z2','2026-10-07','shipped','En camino','Santa Fe','Rosario','Otra Persona',9000,1,'Urbano')");
    const records=await repo.records(1);
    const sale=records.find((r)=>r.shipmentId==='order:O9');
    assert.equal(sale.method,'colecta');
    assert.equal(sale.source,'ml_custom');
    assert.equal(sale.amountCents,null);
    assert.equal(sale.salesCents,200000);
    assert.equal(sale.province,'');
    assert.equal(sale.dispatchDay,'2026-10-04');
    const loose=records.find((r)=>r.shipmentId==='zipnova:Z2');
    assert.equal(loose,undefined);
    assert.equal(records.some((r)=>r.source==='zipnova'),false);
    const full=await repo.report(1,{method:'colecta',from:'2026-10-01',to:'2026-10-31'});
    const fast=await repo.report(1,{method:'colecta',from:'2026-10-01',to:'2026-10-31'},{compact:true});
    for (const key of ['count','totalCents','salesCents','shippingCollectedCents']) assert.equal(fast.summary[key],full.summary[key],key);
    assert.equal(full.summary.totalCents,0);
    assert.equal(full.summary.count,1);
  } finally { cleanup(); }
});

test('Tiendanube totals, snapshot, detail and workspace boundaries reconcile without counting checkout shipping as merchandise', async () => {
  const {db,repo,cleanup}=await fixture();
  try {
    const insert = `INSERT INTO tiendanube_orders(id,workspace_id,integration_connection_id,external_store_id,tiendanube_id,
      status,payment_status,shipping_status,dispatched_at_external,shipping_address_json,total,currency,shipping_cost_customer,shipping_cost_owner)
      VALUES(?, ?, 20, 'store', ?, 'closed', 'paid', 'shipped', '2026-10-05T10:00:00-03:00', ?, '11000', 'ARS', '1000', '850')`;
    const address = JSON.stringify({city:'Córdoba',province:'Córdoba'});
    await db.execute({sql:insert,args:[1,1,'1',address]});
    await db.execute({sql:insert,args:[2,2,'2',address]});
    const filters={from:'2026-10-01',to:'2026-10-31',provinces:'cordoba'};
    const full=await repo.report(1,filters);
    const fast=await repo.report(1,filters,{compact:true,withRows:true,withTargets:true});
    assert.deepEqual(fast.summary,full.summary);
    assert.equal(full.summary.count,1);
    assert.equal(full.summary.salesCents,1000000);
    assert.equal(full.summary.shippingCollectedCents,100000);
    assert.equal(full.summary.totalCents,85000);
    assert.equal(fast.rows[0].shippingCollectedCents,100000);
    assert.equal(fast.syncTargets.length,0); // TN must not be synchronized against ML accounts.
    assert.equal((await repo.records(1,db,{connectionId:20,shipmentId:'tn:store:1'})).length,1);
    assert.equal((await repo.records(2,db,{connectionId:20,shipmentId:'tn:store:1'})).length,0);
    // A fresh but incompatible snapshot must be rebuilt before it can show old Zipnova expenses.
    await db.execute({sql:"UPDATE finance_snapshot_meta SET options_json=? WHERE workspace_id=1",args:[JSON.stringify({version:7})]});
    await db.execute("UPDATE finance_snapshot SET data_json=json_set(data_json,'$.amountCents',9999999) WHERE workspace_id=1 AND row_key LIKE '%tn:%'");
    assert.deepEqual((await repo.report(1,filters,{compact:true})).summary,full.summary);
  } finally {cleanup();}
});

test('settlement matrix counts packages per day and zone and reconciles the amount', () => {
  const items = [
    { deliveryDay: '2026-10-09', zone: 'GBA 1', amountCents: 300000 },
    { deliveryDay: '2026-10-08', zone: 'CABA', amountCents: 250000 },
    { deliveryDay: '2026-10-08', zone: 'CABA', amountCents: 250000 },
    { deliveryDay: '2026-10-09', zone: null, amountCents: 100000 },
  ];
  const m = settlementMatrix(items, ['CABA', 'GBA 1', 'GBA 2', 'GBA 3']);
  assert.deepEqual(m.zones, ['CABA', 'GBA 1', 'GBA 2', 'GBA 3', 'Sin zona']);
  assert.deepEqual(m.days.map((d) => [d.day, d.count, d.totalCents]), [['2026-10-08', 2, 500000], ['2026-10-09', 2, 400000]]);
  assert.equal(m.days[0].counts.CABA, 2);
  assert.equal(m.total.count, 4);
  assert.equal(m.total.totalCents, 900000);
  assert.equal(m.total.cents.CABA, 500000);
  const text = settlementMatrixCsv(m, [{ reason: 'Faltante', amount_cents: -50000 }]);
  assert.match(text, /"08\/10\/2026";"2";"0";"0";"0";"0";"2";"5000,00"/);
  assert.match(text, /"Ajuste: Faltante";"";"";"";"";"";"";"-500,00"/);
  assert.match(text, /"Total a pagar";.*"8500,00"/);
});


test('provisional balance preserves sales with missing shipping or fees and deducts unlinked costs', () => {
  const rows = [
    {salesCents:100000, feesCents:20000, netCents:80000, amountCents:5000},
    {salesCents:200000, feesCents:40000, netCents:160000, amountCents:null},
    {salesCents:50000, feesCents:null, netCents:null, amountCents:1000},
    {salesCents:null, feesCents:null, netCents:null, amountCents:2000},
  ];
  const s = summarize(rows);
  assert.equal(s.netCents,290000);
  assert.equal(s.netAfterShippingCents,282000);
  assert.equal(s.netCents-s.netAfterShippingCents,s.totalCents);
  assert.equal(s.netAfterShippingCents,s.salesCents-s.feesCents-s.totalCents);
  assert.equal(s.netAfterShippingCount,3);
  assert.equal(s.feesUnavailableCount,1);
  assert.equal(s.missingCount,1);
  const completed = summarize(rows.map((r,i)=>i===1?{...r,amountCents:3000}:r));
  assert.equal(completed.netAfterShippingCents,s.netAfterShippingCents-3000);
  assert.equal(summarize([{salesCents:null,amountCents:2000}]).netAfterShippingCents,null);
});


test('Tiendanube sync stores checkout shipping and updates cancellations without replacing zero by unknown', async () => {
  const {db,cleanup}=await fixture();
  try {
    for (const column of ['number','shipping_method','shipping_carrier','is_zipnova','contact_email','contact_phone','products_json','subtotal','created_at_external','updated_at_external'])
      await db.execute(`ALTER TABLE tiendanube_orders ADD COLUMN ${column} TEXT`);
    globalThis.__tiendanubeFinanceDb=db;
    let source=readFileSync(new URL('../src/lib/tiendanubeStore.js',import.meta.url),'utf8');
    source=source.replace("import { db } from '@/lib/db';",'const db = globalThis.__tiendanubeFinanceDb;')
      .replace("import { ensureDb } from '@/lib/ensureDb';",'const ensureDb = async () => {};')
      .replace("import { recordOnlineOrder } from '@/lib/crossselling/storefront-runtime';",'const recordOnlineOrder = async () => {};')
      .replace("'./tiendanubeFinance.js'",JSON.stringify(new URL('../src/lib/tiendanubeFinance.js',import.meta.url).href));
    const {upsertTiendanubeOrder}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
    const order={id:100,number:100,payment_status:'paid',status:'open',currency:'ARS',total:'11000',
      shipping_cost_customer:'1000',shipping_cost_owner:'0',source:'store',shipping_address:{city:'Córdoba',province:'Córdoba'}};
    await upsertTiendanubeOrder(1,order,{connectionId:20,externalStoreId:'store'});
    let stored=(await db.execute('SELECT * FROM tiendanube_orders WHERE tiendanube_id=100')).rows[0];
    assert.equal(stored.shipping_cost_customer,'1000');
    assert.equal(stored.shipping_cost_owner,'0');
    assert.equal(stored.order_source,'store');
    await upsertTiendanubeOrder(1,{...order,status:'cancelled',shipping_cost_customer:'1200'},{connectionId:20,externalStoreId:'store'});
    stored=(await db.execute('SELECT * FROM tiendanube_orders WHERE tiendanube_id=100')).rows[0];
    assert.equal(stored.status,'cancelled');
    assert.equal(stored.shipping_cost_customer,'1200');
    assert.equal((await db.execute('SELECT COUNT(*) n FROM tiendanube_orders')).rows[0].n,1);
  } finally {delete globalThis.__tiendanubeFinanceDb;cleanup();}
});
