import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { carrierConfigScope } from '../src/lib/globalCarrierConfig.js';

test('separación de zonas y transportistas conserva IDs legacy y no mueve otros comercios', async () => {
  const db = createClient({ url: ':memory:' });
  try {
    await db.batch([
      'CREATE TABLE workspaces(id INTEGER PRIMARY KEY, slug TEXT)',
      'CREATE TABLE carriers(id INTEGER PRIMARY KEY, workspace_id INTEGER, name TEXT)',
      'CREATE TABLE zone_mappings(id INTEGER PRIMARY KEY, workspace_id INTEGER, partido TEXT, carrier_name TEXT)',
      "INSERT INTO workspaces VALUES (1,'legacy'),(2,'tienda-2'),(3,'tienda-3')",
      "INSERT INTO carriers VALUES (5,1,'legacy'),(6,2,'propio'),(7,3,'propio')",
      "INSERT INTO zone_mappings VALUES (8,1,'quilmes','legacy'),(9,2,'quilmes','propio'),(10,3,'quilmes','propio')",
    ]);
    assert.equal(await carrierConfigScope(2, db), 2);
    assert.equal(await carrierConfigScope(1, db), 0);
    assert.equal(await carrierConfigScope(3, db), 3);
    assert.deepEqual((await db.execute('SELECT id, workspace_id FROM carriers ORDER BY id')).rows.map(r => [r.id, r.workspace_id]), [[5,0],[6,2],[7,3]]);
    assert.deepEqual((await db.execute('SELECT id, workspace_id FROM zone_mappings ORDER BY id')).rows.map(r => [r.id, r.workspace_id]), [[8,0],[9,2],[10,3]]);
    await assert.rejects(carrierConfigScope(99, db), /no encontrado/);
    await assert.rejects(carrierConfigScope(0, db), /inválido/);
  } finally { db.close(); }
});
