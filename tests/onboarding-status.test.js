import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { getOnboardingStatus } from '../src/lib/onboardingStatus.js';

test('primeros pasos reflejan datos propios y no el estado de otro comercio', async () => {
  const db=createClient({url:':memory:'});
  try {
    await db.batch([
      'CREATE TABLE workspace_integration_connections(workspace_id INTEGER,is_active INTEGER)',
      'CREATE TABLE workspace_integrations(workspace_id INTEGER,is_active INTEGER)',
      'CREATE TABLE shipments(workspace_id INTEGER,raw_zpl TEXT)',
      'CREATE TABLE zone_mappings(workspace_id INTEGER)',
      'CREATE TABLE mercadolibre_orders(workspace_id INTEGER,printed_label_zpl TEXT)',
      'INSERT INTO workspace_integration_connections VALUES(2,1)',
      "INSERT INTO shipments VALUES(2,'label')",
      'INSERT INTO zone_mappings VALUES(2)',
    ]);
    assert.deepEqual(await getOnboardingStatus(db,1,0),{connected:false,shipments:false,zones:false,labels:false});
    assert.deepEqual(await getOnboardingStatus(db,2,2),{connected:true,shipments:true,zones:true,labels:true});
    await db.execute('INSERT INTO workspace_integrations VALUES(1,1)');
    assert.equal((await getOnboardingStatus(db,1,0)).connected,true);
  } finally { db.close(); }
});
