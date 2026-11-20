import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrateCarrierReferences } from '../src/lib/carrierScopeMigration.js';

async function fixture() {
  const db = createClient({url:pathToFileURL(join(mkdtempSync(join(tmpdir(),'geomodi-carrier-')), 'test.db')).href});
  await db.batch([
    'CREATE TABLE workspaces(id INTEGER PRIMARY KEY, slug TEXT)',
    'CREATE TABLE carriers(id INTEGER PRIMARY KEY, workspace_id INTEGER, name TEXT, display_name TEXT, color TEXT)',
    'CREATE TABLE shipments(id INTEGER PRIMARY KEY, workspace_id INTEGER, assigned_carrier TEXT)',
    'CREATE TABLE carrier_rates(id INTEGER PRIMARY KEY, workspace_id INTEGER, carrier_id INTEGER, zone TEXT, valid_from TEXT, amount_cents INTEGER, UNIQUE(workspace_id,carrier_id,zone,valid_from))',
    'CREATE TABLE carrier_settlements(id INTEGER PRIMARY KEY, workspace_id INTEGER, carrier_id INTEGER, status TEXT)',
    'CREATE TABLE shipment_finance(workspace_id INTEGER, responsibility_json TEXT)',
    'CREATE TABLE finance_snapshot(workspace_id INTEGER)',
    'CREATE TABLE finance_snapshot_meta(workspace_id INTEGER)',
    'CREATE TABLE audit_logs(workspace_id INTEGER,actor_type TEXT,action TEXT,entity_type TEXT,entity_id TEXT,metadata_json TEXT)',
    "INSERT INTO workspaces VALUES (1,'legacy'),(2,'tienda-2'),(3,'tienda-3')",
    "INSERT INTO carriers VALUES (10,0,'correo','Correo','#abc'),(20,3,'privado','Privado','#fff')",
    "INSERT INTO carrier_rates VALUES (1,1,10,'CABA','2026-01-01',100),(2,2,10,'CABA','2026-01-01',200)",
    "INSERT INTO shipments VALUES(1,2,'correo')",
    "INSERT INTO shipment_finance VALUES(2,'{\"carrierId\":10}')",
    "INSERT INTO carrier_settlements VALUES(1,2,10,'draft')",
    'INSERT INTO finance_snapshot VALUES(2)', 'INSERT INTO finance_snapshot_meta VALUES(2)',
  ]);
  return db;
}

test('simula y migra referencias sin alterar legacy ni otro espacio', async () => {
  const db=await fixture();
  try {
    const plan=await migrateCarrierReferences(db);
    assert.equal(plan.length,1);
    assert.equal((await db.execute('SELECT count(*) n FROM carriers')).rows[0].n,2);
    const tx=await db.transaction('write');
    const applied=await migrateCarrierReferences(tx,{apply:true});
    await tx.commit();
    const id=applied[0].newId;
    assert.notEqual(id,10);
    assert.equal((await db.execute('SELECT carrier_id FROM carrier_rates WHERE id=1')).rows[0].carrier_id,10);
    assert.equal((await db.execute('SELECT carrier_id FROM carrier_rates WHERE id=2')).rows[0].carrier_id,id);
    assert.equal((await db.execute('SELECT carrier_id FROM carrier_settlements WHERE id=1')).rows[0].carrier_id,id);
    assert.equal((await db.execute("SELECT json_extract(responsibility_json,'$.carrierId') id FROM shipment_finance")).rows[0].id,id);
    assert.equal((await db.execute('SELECT count(*) n FROM finance_snapshot')).rows[0].n,0);
    assert.equal((await db.execute("SELECT count(*) n FROM audit_logs WHERE action='carrier_scope_migration'")).rows[0].n,1);
    assert.equal((await db.execute('SELECT workspace_id FROM carriers WHERE id=20')).rows[0].workspace_id,3);
    assert.equal((await migrateCarrierReferences(db)).length,0);
  } finally {db.close();}
});

test('no migra liquidaciones cerradas y no sobrescribe tarifas en conflicto', async () => {
  const db=await fixture();
  try {
    await db.execute("UPDATE carrier_settlements SET status='paid'");
    await assert.rejects(migrateCarrierReferences(db),/liquidaciones cerradas/);
    await db.execute("UPDATE carrier_settlements SET status='draft'");
    await db.execute("INSERT INTO carriers VALUES(30,2,'correo','Correo propio','#000')");
    await db.execute("INSERT INTO carrier_rates VALUES(3,2,30,'CABA','2026-01-01',999)");
    const tx=await db.transaction('write');
    try { await assert.rejects(migrateCarrierReferences(tx,{apply:true})); } finally { await tx.rollback(); }
    assert.equal((await db.execute('SELECT carrier_id FROM carrier_rates WHERE id=2')).rows[0].carrier_id,10);
    assert.equal((await db.execute('SELECT amount_cents FROM carrier_rates WHERE id=3')).rows[0].amount_cents,999);
  } finally {db.close();}
});
