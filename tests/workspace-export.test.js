import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { exportWorkspace } from '../src/lib/workspaceExport.js';

test('la exportación incluye solo el espacio pedido y omite credenciales (datos ficticios)', async () => {
  const db = createClient({ url: ':memory:' });
  try {
    await db.batch([
      'CREATE TABLE shipments(id INTEGER PRIMARY KEY, workspace_id INTEGER, tracking TEXT, api_token TEXT)',
      'CREATE TABLE carriers(id INTEGER PRIMARY KEY, workspace_id INTEGER, name TEXT)',
      "INSERT INTO shipments VALUES (1,2,'A-1','secreto'),(2,3,'B-1','otro')",
      "INSERT INTO carriers VALUES (1,2,'propio'),(2,3,'ajeno')",
    ]);
    const result = await exportWorkspace(db, { workspaceId: 2 });
    assert.deepEqual(result.tables.shipments, [{ id: 1, workspace_id: 2, tracking: 'A-1' }]);
    assert.deepEqual(result.tables.carriers.map(r => r.name), ['propio']);
    assert.deepEqual(result.omittedColumns.shipments, ['api_token']);
    assert.ok(!JSON.stringify(result).includes('secreto') && !JSON.stringify(result).includes('ajeno') && !JSON.stringify(result).includes('B-1'));
    await assert.rejects(exportWorkspace(db, { workspaceId: 0 }), /inválido/);
  } finally { db.close(); }
});
