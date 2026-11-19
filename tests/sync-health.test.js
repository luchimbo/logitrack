import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { syncBacklog } from '../src/lib/syncHealth.js';

test('detecta reintentos vencidos, agotados o acumulados y tolera tablas ausentes', async () => {
  const db = createClient({ url: ':memory:' });
  try {
    const now = new Date('2026-11-19T12:00:00Z');
    assert.deepEqual((await syncBacklog(db, { now })).problems, []);
    await db.batch([
      'CREATE TABLE ml_sync_retries(order_id TEXT, attempts INTEGER, next_attempt_at TEXT)',
      "INSERT INTO ml_sync_retries VALUES('a',1,'2026-11-19 11:30:00'),('b',2,'2026-11-19 12:30:00')",
    ]);
    assert.deepEqual((await syncBacklog(db, { now })).problems, []);
    await db.execute("INSERT INTO ml_sync_retries VALUES('c',10,'2026-11-19 08:00:00')");
    const { problems } = await syncBacklog(db, { now });
    assert.equal(problems.length, 2);
    assert.ok(problems.some(p => /vencidos/.test(p)) && problems.some(p => /10 intentos/.test(p)));
  } finally { db.close(); }
});
