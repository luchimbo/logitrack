import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { assignWorkspaceUser } from '../src/lib/workspaceMembership.js';

const actor = { workspaceId: 1, appUserId: 1, role: 'owner', isGlobalAdmin: true, email: 'owner@example.com', authType: 'clerk' };
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'geomodi-membership-'));
  const db = createClient({ url: pathToFileURL(join(directory, 'test.db')).href });
  await db.executeMultiple(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, name TEXT, slug TEXT);
    CREATE TABLE app_users (id INTEGER PRIMARY KEY, email TEXT UNIQUE, clerk_user_id TEXT UNIQUE, is_global_admin INTEGER DEFAULT 0, last_seen_at TEXT, onboarding_completed INTEGER DEFAULT 1);
    CREATE TABLE workspace_members (id INTEGER PRIMARY KEY, workspace_id INTEGER, app_user_id INTEGER, role TEXT, UNIQUE(workspace_id, app_user_id));
    CREATE TABLE audit_logs (workspace_id INTEGER, app_user_id INTEGER, actor_type TEXT, actor_label TEXT, action TEXT, entity_type TEXT, entity_id TEXT, metadata_json TEXT);
    CREATE TABLE workspace_settings (workspace_id INTEGER, printing_setup_completed INTEGER);
    INSERT INTO workspaces VALUES (1,'GeoModi','legacy'), (2,'Anterior','anterior'), (3,'Otro','otro');
    INSERT INTO app_users (id,email,clerk_user_id,is_global_admin,last_seen_at) VALUES (1,'owner@example.com','clerk-owner',1,CURRENT_TIMESTAMP),(2,'registered@example.com','clerk-user',0,CURRENT_TIMESTAMP);
    INSERT INTO workspace_members VALUES (1,1,1,'owner'),(2,2,2,'owner'),(3,3,2,'admin');
  `);
  return db;
}
test('registered users require explicit reassignment; transaction preserves spaces and audits previous memberships', async () => {
  const db = await fixture();
  try {
    await assert.rejects(assignWorkspaceUser(db, actor, { email: 'registered@example.com', role: 'admin' }), e => e.status === 409 && e.canReassign);
    assert.equal((await db.execute('SELECT * FROM workspace_members WHERE app_user_id=2')).rows.length, 2);
    const result = await assignWorkspaceUser(db, actor, { email: ' REGISTERED@EXAMPLE.COM ', role: 'admin', reassign: true });
    assert.equal(result.isPending, false);
    assert.equal(result.reassigned, true);
    const rows = (await db.execute('SELECT workspace_id, role FROM workspace_members WHERE app_user_id=2')).rows;
    assert.deepEqual(rows.map(r => [r.workspace_id,r.role]), [[1,'admin']]);
    assert.equal((await db.execute('SELECT * FROM workspaces')).rows.length, 3);
    assert.equal(JSON.parse((await db.execute('SELECT metadata_json FROM audit_logs')).rows[0].metadata_json).previousMemberships.length, 2);
    await assignWorkspaceUser(db, actor, { email: 'registered@example.com', role: 'user' });
    assert.equal((await db.execute('SELECT * FROM workspace_members WHERE app_user_id=2')).rows.length, 1);
  } finally { db.close(); }
});
test('pending accounts normalize email and reuse membership; owners remain owners', async () => {
  const db = await fixture();
  try {
    const result = await assignWorkspaceUser(db, actor, { email: ' NEW@EXAMPLE.COM ', role: 'admin' });
    assert.equal(result.isPending, true);
    await assignWorkspaceUser(db, actor, { email: 'new@example.com', role: 'user' });
    assert.equal((await db.execute("SELECT * FROM app_users WHERE email='new@example.com'")).rows.length, 1);
    const owner = await assignWorkspaceUser(db, actor, { email: actor.email, role: 'user' });
    assert.equal(owner.role, 'owner');
  } finally { db.close(); }
});
test('ordinary admins cannot transfer users; unauthorized actors and malformed inputs cannot mutate memberships', async () => {
  const db = await fixture();
  try {
    const admin = { ...actor, isGlobalAdmin: false, role: 'admin' };
    await assert.rejects(assignWorkspaceUser(db, admin, { email: 'registered@example.com' }), e => e.status === 409 && !e.canReassign);
    await assert.rejects(assignWorkspaceUser(db, admin, { email: 'registered@example.com', reassign: true }), e => e.status === 403);
    await assert.rejects(assignWorkspaceUser(db, { ...admin, role: 'user' }, { email: 'new@example.com' }), e => e.status === 403);
    for (const input of [{ email: 42 }, { email: 'invalid' }, { email: 'new@example.com', role: 'owner' }]) {
      await assert.rejects(assignWorkspaceUser(db, actor, input), e => e.status === 400);
    }
    await assert.rejects(assignWorkspaceUser(db, actor, { email: actor.email, reassign: true }), e => e.status === 403);
    assert.equal((await db.execute('SELECT * FROM workspace_members')).rows.length, 3);
  } finally { db.close(); }
});
test('audit failure rolls back removals, role changes and newly created users', async () => {
  const db = await fixture();
  try {
    await db.execute("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
    await assert.rejects(assignWorkspaceUser(db, actor, { email: 'registered@example.com', reassign: true, role: 'admin' }));
    assert.deepEqual((await db.execute('SELECT workspace_id,role FROM workspace_members WHERE app_user_id=2 ORDER BY id')).rows.map(r => [r.workspace_id,r.role]), [[2,'owner'],[3,'admin']]);
    await assert.rejects(assignWorkspaceUser(db, actor, { email: 'new@example.com' }));
    assert.equal((await db.execute("SELECT * FROM app_users WHERE email='new@example.com'")).rows.length, 0);
  } finally { db.close(); }
});

// Exercise both authentication paths with the same Clerk session across the transfer.
test('existing session resolves new workspace immediately in fast and refreshed authentication paths', async () => {
  const db = await fixture();
  const key = '__membershipAuthTest';
  globalThis[key] = db;
  try {
    let source = readFileSync(new URL('../src/lib/auth.js', import.meta.url), 'utf8');
    source = source.replace('import { auth, currentUser } from "@clerk/nextjs/server";', `const auth = async () => ({userId:'clerk-user'}); const currentUser = async () => ({primaryEmailAddress:{emailAddress:'registered@example.com'}});`)
      .replace('import { jwtVerify } from "jose";', 'const jwtVerify = async () => { throw Error("unused"); };')
      .replace('import { db } from "@/lib/db";', `const db = globalThis.${key};`)
      .replace('import { ensureDb } from "@/lib/ensureDb";', 'const ensureDb = async () => {};')
      .replace('import { logAudit } from "@/lib/audit";', 'const logAudit = async () => {};');
    const { getCurrentActor } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const request = { cookies: { get: () => undefined } };
    assert.equal((await getCurrentActor(request)).workspaceId, 2);
    await assignWorkspaceUser(db, actor, { email: 'registered@example.com', role: 'admin', reassign: true });
    const resolved = await getCurrentActor(request);
    assert.equal(resolved.workspaceId, 1);
    assert.equal(resolved.role, 'admin');
    await db.execute('UPDATE app_users SET last_seen_at=NULL WHERE id=2');
    assert.equal((await getCurrentActor(request)).workspaceId, 1);
    assert.equal((await db.execute('SELECT * FROM workspace_members WHERE app_user_id=2 AND workspace_id IN (2,3)')).rows.length, 0);
  } finally { delete globalThis[key]; db.close(); }
});
