import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { finishSyncRun, listWorkspaceSyncHealth, pruneSyncRuns, startSyncRun, summarizeConnectionHealth } from '../src/lib/syncRuns.js';
import { isMercadoLibreReauthError } from '../src/lib/mercadolibreAuthErrors.js';

const NOW = new Date('2026-11-27T12:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const conn = { id: 3, provider: 'mercadolibre', displayName: 'PCMIDI', authError: null };
const run = (status, h, extra = {}) => ({ status, started_at: hoursAgo(h), finished_at: hoursAgo(h - 0.05), error: null, ...extra });

test('estado por conexión: correcto, aviso, fallando, desactualizado, cortado y reconectar', () => {
  const summary = (runs, connection = conn) => summarizeConnectionHealth(connection, runs, { now: NOW });
  assert.equal(summary([run('ok', 2)]).status, 'ok');
  assert.equal(summary([]).status, 'unknown');
  assert.equal(summary([run('error', 2, { error: 'timeout ML' }), run('ok', 26)]).status, 'warning');
  assert.equal(summary([run('partial', 2), run('ok', 26)]).status, 'warning');

  const failing = summary([run('error', 2), run('error', 26), run('ok', 50)]);
  assert.equal(failing.status, 'failing');
  assert.equal(failing.consecutiveFailures, 2);
  assert.equal(failing.lastOkAt, hoursAgo(49.95));

  assert.equal(summary([run('ok', 40)]).status, 'stale');

  // Una corrida que sigue "running" mucho después de empezar fue cortada por el límite de Vercel.
  const cut = summary([{ status: 'running', started_at: hoursAgo(3), finished_at: null }, run('ok', 26)]);
  assert.equal(cut.lastRunStatus, 'interrupted');
  assert.equal(cut.status, 'warning');
  // Pero la que está corriendo ahora mismo no cuenta como fallo.
  assert.equal(summary([{ status: 'running', started_at: hoursAgo(0.01) }, run('ok', 2)]).status, 'ok');

  assert.equal(summary([run('ok', 2)], { ...conn, authError: 'invalid_grant' }).status, 'needs_reauth');
  assert.equal(summary([run('needs_reauth', 2)]).status, 'needs_reauth');
});

test('registra corridas en la base y arma el estado del espacio sin mezclar otros espacios ni upkeep', async () => {
  const db = createClient({ url: ':memory:' });
  try {
    await db.batch([
      `CREATE TABLE workspace_integration_connections (id INTEGER PRIMARY KEY, workspace_id INTEGER, provider TEXT, external_store_id TEXT,
        display_name TEXT, is_active INTEGER, auth_error TEXT, auth_error_at TEXT)`,
      "INSERT INTO workspace_integration_connections VALUES (3,1,'mercadolibre','111','PCMIDI',1,NULL,NULL),(4,1,'mercadolibre','222','Otra',1,'invalid_grant',NULL),(9,2,'mercadolibre','333','Ajena',1,NULL,NULL)",
    ]);
    const first = await startSyncRun(db, { workspaceId: 1, connectionId: 3, provider: 'mercadolibre', job: 'ml-sync', now: new Date(hoursAgo(26)) });
    await finishSyncRun(db, first, { status: 'error', error: new Error('x'.repeat(900)), now: new Date(hoursAgo(25.9)) });
    const second = await startSyncRun(db, { workspaceId: 1, connectionId: 3, provider: 'mercadolibre', job: 'ml-sync', now: new Date(hoursAgo(2)) });
    await finishSyncRun(db, second, { status: 'error', error: 'timeout', synced: 0, details: { phase: 'orders' }, now: new Date(hoursAgo(1.9)) });
    // Un upkeep correcto posterior no tapa que la sincronización diaria falla.
    const upkeep = await startSyncRun(db, { workspaceId: 1, connectionId: 3, provider: 'mercadolibre', job: 'ml-upkeep', now: new Date(hoursAgo(1.5)) });
    await finishSyncRun(db, upkeep, { status: 'ok', now: new Date(hoursAgo(1.4)) });

    const health = await listWorkspaceSyncHealth(db, 1, { now: NOW });
    assert.deepEqual(health.map((item) => [item.connectionId, item.status]), [[3, 'failing'], [4, 'needs_reauth']]);
    assert.equal(health[0].lastError, 'timeout');

    const stored = (await db.execute('SELECT error FROM integration_sync_runs WHERE id = ?', [first])).rows[0];
    assert.equal(stored.error.length, 500);

    await pruneSyncRuns(db, { now: new Date(NOW.getTime() + 61 * 86_400_000) });
    assert.equal(Number((await db.execute('SELECT count(*) AS n FROM integration_sync_runs')).rows[0].n), 0);
  } finally {
    db.close();
  }
});

test('solo un rechazo definitivo del token pide reconectar', () => {
  assert.equal(isMercadoLibreReauthError({ code: 'invalid_grant', status: 400 }), true);
  assert.equal(isMercadoLibreReauthError({ status: 400, message: 'refresh token expired' }), true);
  assert.equal(isMercadoLibreReauthError({ status: 500, message: 'invalid_grant?' }), false);
  assert.equal(isMercadoLibreReauthError(new Error('fetch failed')), false);
});

test('el cron diario registra cada cuenta y respeta un presupuesto menor al corte de Vercel', () => {
  const source = readFileSync(new URL('../src/app/api/cron/mercadolibre-sync/route.js', import.meta.url), 'utf8');
  assert.match(source, /startSyncRun\(db/);
  assert.match(source, /finishSyncRun\(db/);
  const budget = Number(source.match(/const BUDGET_MS = ([\d_]+)/)[1].replace(/_/g, ''));
  assert.ok(budget < 300_000 - 30_000, 'el presupuesto debe dejar margen antes de los 300 s');
  assert.match(source, /if \(inBudget\(\)\) await recoverMercadoLibreNotifications/);
});

test('una cuenta con token vencido no deja sin datos a las demás', () => {
  const source = readFileSync(new URL('../src/lib/mercadolibreResolver.js', import.meta.url), 'utf8');
  assert.match(source, /markIntegrationConnectionAuthError/);
  assert.match(source, /catch \(error\) \{\s*console\.error\('Mercado Libre connection unavailable'[\s\S]*?continue;/);
});

import { tiendanubeSyncWindowStart } from '../src/lib/syncRuns.js';

test('ventana incremental de Tiendanube: última corrida correcta menos 2 h, 3 días sin historial, tope de 14 días', () => {
  assert.equal(tiendanubeSyncWindowStart(hoursAgo(1), { now: NOW }), hoursAgo(3));
  assert.equal(tiendanubeSyncWindowStart(null, { now: NOW }), hoursAgo(72));
  assert.equal(tiendanubeSyncWindowStart(hoursAgo(24 * 30), { now: NOW }), hoursAgo(24 * 14));
});

test('el estado incluye tiendas Tiendanube medidas sobre su propio cron', async () => {
  const db = createClient({ url: ':memory:' });
  try {
    await db.execute(`CREATE TABLE workspace_integration_connections (id INTEGER PRIMARY KEY, workspace_id INTEGER, provider TEXT, external_store_id TEXT,
      display_name TEXT, is_active INTEGER, auth_error TEXT, auth_error_at TEXT)`);
    await db.execute("INSERT INTO workspace_integration_connections VALUES (5,1,'tiendanube','7570182','Demo',1,'La app se desinstaló en Tiendanube',NULL),(6,1,'tiendanube','78394','PC MIDI',1,NULL,NULL)");
    const id = await startSyncRun(db, { workspaceId: 1, connectionId: 6, provider: 'tiendanube', job: 'tn-sync', now: new Date(hoursAgo(1)) });
    await finishSyncRun(db, id, { status: 'ok', synced: 12, now: new Date(hoursAgo(0.9)) });
    const health = await listWorkspaceSyncHealth(db, 1, { now: NOW });
    assert.deepEqual(health.map((item) => [item.connectionId, item.status]), [[5, 'needs_reauth'], [6, 'ok']]);
    assert.match(health[0].message, /^Tiendanube rechazó/);
  } finally {
    db.close();
  }
});
