import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FINANCE_SCHEMA } from '../src/lib/financeSchema.js';
import { createFinanceRepository } from '../src/lib/financeRepository.js';
import { deliveryFacts, financeRecord, sellerCost, summarize, groupRecords, chooseRate, validDate, csv, preserveMercadoLibreDetails, shipmentFinanceStatement, orderSales, shipmentSales } from '../src/lib/logisticsFinance.js';

test('sales use paid ARS gross totals, keeping zero, unknown and cancellation distinct', () => {
  assert.equal(orderSales({status:'paid',currency:'ARS',total:'0'}).salesCents,0);
  assert.equal(orderSales({status:'paid',currency:'ARS',total:''}).salesCents,null);
  assert.equal(orderSales({status:'paid',currency:'USD',total:'100'}).salesCents,null);
  assert.equal(orderSales({status:'confirmed',currency:'ARS',total:'100'}).salesCents,null);
  assert.equal(orderSales({status:'cancelled',currency:'ARS',total:'100'}).salesCents,0);
  assert.equal(orderSales({status:'paid',currency:'ARS',total:'-1'}).salesCents,null);
  assert.equal(orderSales({raw_order_json:JSON.stringify({status:'paid',currency_id:'ARS',total_amount:125.50,paid_amount:150})}).salesCents,12550);
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
  for (const column of ['status','currency','total','raw_order_json','carrier_json','printed_label_zpl']) {
    await db.execute(`ALTER TABLE mercadolibre_orders ADD COLUMN ${column} TEXT`);
  }
  await db.execute('ALTER TABLE shipments ADD COLUMN raw_zpl TEXT');
  await db.execute('ALTER TABLE shipments ADD COLUMN recipient_name TEXT');
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
