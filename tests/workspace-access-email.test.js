import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
import { ensureWorkspaceAccessEmails, resolveWorkspaceTarget, sendWorkspaceAccessEmail } from '../src/lib/workspaceAccessEmail.js';

const actor = { workspaceId: 1, appUserId: 1, role: 'owner', isGlobalAdmin: true, email: 'owner@example.com', authType: 'clerk' };
async function fixture() {
  const db = createClient({url: ':memory:'});
  await db.executeMultiple(`
    CREATE TABLE workspaces(id INTEGER PRIMARY KEY,name TEXT,slug TEXT);
    CREATE TABLE app_users(id INTEGER PRIMARY KEY,email TEXT,clerk_user_id TEXT);
    CREATE TABLE workspace_members(id INTEGER PRIMARY KEY,workspace_id INTEGER,app_user_id INTEGER,role TEXT);
    CREATE TABLE audit_logs(workspace_id INTEGER,app_user_id INTEGER,actor_type TEXT,actor_label TEXT,action TEXT,entity_type TEXT,entity_id TEXT,metadata_json TEXT);
    INSERT INTO workspaces VALUES(1,'Legacy','legacy'),(2,'Other','other');
    INSERT INTO app_users VALUES(1,'owner@example.com','clerk-owner'),(2,'member@example.com','pending:member@example.com');
    INSERT INTO workspace_members VALUES(1,1,1,'owner'),(2,1,2,'admin');
  `);
  await ensureWorkspaceAccessEmails(db);
  return db;
}
function provider(registered, calls, fail = false) {
  return async () => ({
    users: { getUserList: async input => { assert.deepEqual(input.emailAddress,['member@example.com']); return {data:registered ? [{id:'clerk-member'}] : []}; } },
    invitations: { createInvitation: async input => { calls.push(input); if (fail) throw {status:503}; return {id:'inv_1'}; } },
  });
}
for (const registered of [true,false]) test(`access email uses ${registered ? 'existing account sign-in' : 'sign-up'} and preserves membership`, async () => {
  const db = await fixture(), calls = [];
  try {
    const result = await sendWorkspaceAccessEmail({db,actor,email:' MEMBER@EXAMPLE.COM ',getClient:provider(registered,calls),appUrl:'https://www.geomodi.ai'});
    assert.equal(result.status,'sent');
    assert.equal(calls.length,1);
    assert.equal(calls[0].notify,true);
    assert.equal(calls[0].ignoreExisting,true);
    assert.equal(calls[0].expiresInDays,7);
    assert.equal(calls[0].redirectUrl,`https://www.geomodi.ai/workspace-access?registered=${registered?1:0}`);
    assert.equal((await db.execute('SELECT role FROM workspace_members WHERE app_user_id=2')).rows[0].role,'admin');
    assert.equal((await db.execute('SELECT status FROM workspace_access_emails')).rows[0].status,'sent');
    const again = await sendWorkspaceAccessEmail({db,actor,email:'member@example.com',getClient:provider(registered,calls)});
    assert.equal(again.status,'cooldown'); assert.equal(calls.length,1);
  } finally { db.close(); }
});
test('email failure is visible, retains access and can be retried after cooldown', async () => {
  const db = await fixture(), calls = [];
  try {
    const result = await sendWorkspaceAccessEmail({db,actor,email:'member@example.com',getClient:provider(false,calls,true)});
    assert.equal(result.status,'failed');
    assert.equal((await db.execute('SELECT role FROM workspace_members WHERE app_user_id=2')).rows[0].role,'admin');
    await db.execute("UPDATE workspace_access_emails SET attempted_at=datetime('now','-61 seconds')");
    assert.equal((await sendWorkspaceAccessEmail({db,actor,email:'member@example.com',getClient:provider(false,calls)})).status,'sent');
  } finally { db.close(); }
});
test('unassigned recipients, ambiguous memberships and ordinary users cannot send invitations', async () => {
  const db = await fixture(), calls = [];
  try {
    const args = {db,actor,email:'member@example.com',getClient:provider(false,calls)};
    await assert.rejects(sendWorkspaceAccessEmail({...args,actor:{...actor,isGlobalAdmin:false,role:'user'}}),e=>e.status===403);
    await assert.rejects(sendWorkspaceAccessEmail({...args,email:'outsider@example.com'}),e=>e.status===404);
    await db.execute("INSERT INTO workspace_members VALUES(3,2,2,'owner')");
    await assert.rejects(sendWorkspaceAccessEmail(args),e=>e.status===409);
    assert.equal(calls.length,0);
  } finally { db.close(); }
});
test('only global admins can select another destination workspace', async () => {
  const db = await fixture();
  try {
    assert.equal((await resolveWorkspaceTarget(db,actor,null)).workspaceName,'GeoModi');
    assert.equal((await resolveWorkspaceTarget(db,actor,2)).workspaceId,2);
    await assert.rejects(resolveWorkspaceTarget(db,{...actor,isGlobalAdmin:false},2),e=>e.status===403);
    for (const id of ['wrong',0,-1,1.5]) await assert.rejects(resolveWorkspaceTarget(db,actor,id),e=>e.status===400);
    await assert.rejects(resolveWorkspaceTarget(db,actor,999),e=>e.status===404);
  } finally { db.close(); }
});
test('access landing keeps only new-account tickets and never forwards arbitrary destinations', async () => {
  let source = readFileSync(new URL('../src/app/workspace-access/route.js',import.meta.url),'utf8');
  source = source.replace("import { NextResponse } from 'next/server';",'const NextResponse = { redirect: url => url };');
  const {GET} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const existing = GET({url:'https://www.geomodi.ai/workspace-access?registered=1&__clerk_ticket=secret&returnTo=https://evil.test'});
  assert.equal(existing.pathname,'/login'); assert.equal(existing.searchParams.get('__clerk_ticket'),null);
  assert.equal(existing.searchParams.get('returnTo'),'/app');
  const pending = GET({url:'https://www.geomodi.ai/workspace-access?registered=0&__clerk_ticket=secret'});
  assert.equal(pending.pathname,'/sign-up'); assert.equal(pending.searchParams.get('__clerk_ticket'),'secret');
});
