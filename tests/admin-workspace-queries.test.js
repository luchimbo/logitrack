import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';

test('administrative counts do not multiply shipments, batches, members or audit activity', async () => {
  const db = createClient({ url: ':memory:' });
  try {
    await db.executeMultiple(`
      CREATE TABLE workspaces(id INTEGER PRIMARY KEY,name TEXT,slug TEXT,created_at TEXT);
      CREATE TABLE app_users(id INTEGER PRIMARY KEY,email TEXT,created_at TEXT,last_seen_at TEXT);
      CREATE TABLE workspace_members(id INTEGER PRIMARY KEY,workspace_id INTEGER,app_user_id INTEGER,role TEXT);
      CREATE TABLE shipments(id INTEGER PRIMARY KEY,workspace_id INTEGER);
      CREATE TABLE daily_batches(id INTEGER PRIMARY KEY,workspace_id INTEGER,created_by_app_user_id INTEGER,total_packages INTEGER);
      CREATE TABLE audit_logs(id INTEGER PRIMARY KEY,workspace_id INTEGER,app_user_id INTEGER,created_at TEXT);
      CREATE TABLE carriers(id INTEGER PRIMARY KEY,workspace_id INTEGER);
      CREATE TABLE zone_mappings(id INTEGER PRIMARY KEY,workspace_id INTEGER);
      CREATE TABLE workspace_integrations(id INTEGER PRIMARY KEY,workspace_id INTEGER);
      CREATE TABLE workspace_integration_connections(id INTEGER PRIMARY KEY,workspace_id INTEGER);
      INSERT INTO workspaces VALUES(1,'GeoModi','legacy','2026-10-26'),(2,'Empty','empty','2026-10-25');
      INSERT INTO app_users VALUES(1,'owner@example.com','2026-10-26','2026-10-26'),(2,'member@example.com','2026-10-26','2026-10-26');
      INSERT INTO workspace_members VALUES(1,1,1,'owner'),(2,1,2,'admin');
      INSERT INTO daily_batches VALUES(1,1,1,5),(2,1,1,7);
      INSERT INTO audit_logs VALUES(1,1,1,'2026-10-24'),(2,1,1,'2026-10-25'),(3,1,1,'2026-10-26');
      WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<3000) INSERT INTO shipments SELECT x,1 FROM n;
    `);
    const source = name => readFileSync(new URL(`../src/app/api/admin/${name}/route.js`, import.meta.url), 'utf8');
    const listSql = source('workspaces').match(/sql: `([\s\S]*?)`/)[1];
    const list = (await db.execute(listSql)).rows;
    assert.equal(list[0].members, 2);
    assert.equal(list[0].shipments, 3000);
    assert.equal(list[0].batches, 2);
    assert.equal(list[0].last_activity_at, '2026-10-26');
    assert.equal(list[1].members, 0);
    assert.equal(list[1].owner_email, null);
    const detailSql = source('workspaces/[id]').match(/sql: `([\s\S]*?)`/)[1];
    assert.equal((await db.execute({sql:detailSql,args:[1]})).rows[0].members, 2);
    const overviewSql = source('overview').match(/sql: `(SELECT w.id[\s\S]*?)`/)[1];
    assert.equal((await db.execute(overviewSql)).rows[0].shipments, 3000);
    const userSql = source('users').match(/sql: `([\s\S]*?)`/)[1];
    const owner = (await db.execute(userSql)).rows.find(u => u.email === 'owner@example.com');
    assert.equal(owner.batches_created, 2);
    assert.equal(owner.packages_uploaded, 12);
    const diagnosticSql = source('diagnostico').match(/const workspaces = await exec\(`([\s\S]*?)`/)[1];
    assert.equal((await db.execute(diagnosticSql)).rows[0].shipments, 3000);
  } finally { db.close(); }
});
