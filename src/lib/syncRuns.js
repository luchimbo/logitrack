// Registro de cada corrida de sincronización por conexión, para que un fallo del
// cron deje rastro visible en la app y no solo en los logs de Vercel.
// Recibe la conexión a la base como parámetro: se puede probar sin la base real.

export const SYNC_RUN_RETENTION_DAYS = 60;
// El sync de ML corre una vez por día. Sin una corrida correcta en 36 h, algo falla.
export const SYNC_STALE_HOURS = 36;
// Una corrida que sigue "running" pasado este tiempo fue cortada (por ejemplo, el 504 de Vercel a los 300 s).
export const SYNC_RUN_INTERRUPTED_MINUTES = 10;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS integration_sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL,
    connection_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    job TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    error TEXT,
    synced INTEGER,
    elapsed_ms INTEGER,
    details_json TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sync_runs_connection ON integration_sync_runs(connection_id, started_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_runs_workspace ON integration_sync_runs(workspace_id, started_at)`,
];

const schemaReady = new WeakMap();
export async function ensureSyncRunsSchema(db) {
  if (!schemaReady.has(db)) {
    schemaReady.set(db, (async () => { for (const sql of SCHEMA) await db.execute(sql); })().catch((error) => {
      schemaReady.delete(db);
      throw error;
    }));
  }
  return schemaReady.get(db);
}

const iso = (date) => new Date(date).toISOString();

// Trabajo cuyo estado se muestra por proveedor. upkeep y catch-up quedan como diagnóstico.
export const HEALTH_JOB_BY_PROVIDER = { mercadolibre: 'ml-sync', tiendanube: 'tn-sync' };
const PROVIDER_LABEL = { mercadolibre: 'Mercado Libre', tiendanube: 'Tiendanube' };

// Solo 'ok': una corrida cortada por tope dejó pedidos sin traer y la ventana debe volver a cubrirlos.
export async function lastSuccessfulSyncRunAt(db, connectionId, job) {
  await ensureSyncRunsSchema(db);
  const row = (await db.execute({
    sql: `SELECT started_at FROM integration_sync_runs WHERE connection_id = ? AND job = ? AND status = 'ok'
          ORDER BY started_at DESC LIMIT 1`,
    args: [Number(connectionId), job],
  })).rows[0];
  return row?.started_at || null;
}

// Desde la última corrida correcta con 2 h de margen (relojes y webhooks demorados).
// Sin corridas previas, los últimos 3 días. Nunca más de 14 días atrás.
export function tiendanubeSyncWindowStart(lastOkAt, { now = new Date() } = {}) {
  const nowMs = new Date(now).getTime();
  const last = lastOkAt ? new Date(lastOkAt).getTime() : NaN;
  const from = Number.isFinite(last) ? last - 2 * 3_600_000 : nowMs - 3 * 86_400_000;
  return iso(Math.max(from, nowMs - 14 * 86_400_000));
}
const shortError = (error) => String(error?.message || error || '').slice(0, 500) || null;

export async function startSyncRun(db, { workspaceId, connectionId, provider, job, now = new Date() }) {
  await ensureSyncRunsSchema(db);
  const result = await db.execute({
    sql: `INSERT INTO integration_sync_runs (workspace_id, connection_id, provider, job, status, started_at) VALUES (?, ?, ?, ?, 'running', ?)`,
    args: [Number(workspaceId), Number(connectionId), provider, job, iso(now)],
  });
  return Number(result.lastInsertRowid || 0);
}

// status: 'ok' | 'partial' (terminó con fases salteadas o con errores parciales) | 'error' | 'needs_reauth'
export async function finishSyncRun(db, runId, { status, error = null, synced = null, elapsedMs = null, details = null, now = new Date() }) {
  if (!runId) return;
  let detailsJson = null;
  if (details != null) {
    try { detailsJson = JSON.stringify(details).slice(0, 8000); } catch { detailsJson = null; }
  }
  await db.execute({
    sql: `UPDATE integration_sync_runs SET status = ?, error = ?, synced = ?, elapsed_ms = ?, details_json = ?, finished_at = ? WHERE id = ?`,
    args: [status, shortError(error), synced == null ? null : Number(synced), elapsedMs == null ? null : Math.round(elapsedMs), detailsJson, iso(now), Number(runId)],
  });
}

export async function pruneSyncRuns(db, { now = new Date(), days = SYNC_RUN_RETENTION_DAYS } = {}) {
  await ensureSyncRunsSchema(db);
  await db.execute({
    sql: 'DELETE FROM integration_sync_runs WHERE started_at < ?',
    args: [iso(new Date(now).getTime() - days * 86_400_000)],
  });
}

// Estado de una conexión a partir de sus últimas corridas (más reciente primero).
export function summarizeConnectionHealth(connection, runs, { now = new Date() } = {}) {
  const nowMs = new Date(now).getTime();
  const effective = runs.map((run) => {
    const interrupted = run.status === 'running'
      && nowMs - new Date(run.started_at).getTime() > SYNC_RUN_INTERRUPTED_MINUTES * 60_000;
    return interrupted ? { ...run, status: 'interrupted', error: run.error || 'La corrida se cortó antes de terminar (tiempo agotado).' } : run;
  });
  const finished = effective.filter((run) => run.status !== 'running');
  const last = finished[0] || null;
  const lastOk = finished.find((run) => run.status === 'ok' || run.status === 'partial') || null;
  let consecutiveFailures = 0;
  for (const run of finished) {
    if (run.status === 'ok' || run.status === 'partial') break;
    consecutiveFailures++;
  }

  let status = 'ok';
  let message = '';
  if (connection.authError) {
    status = 'needs_reauth';
    message = `${PROVIDER_LABEL[connection.provider] || 'El canal'} rechazó el acceso de esta cuenta. Hay que volver a conectarla desde Canales.`;
  } else if (last?.status === 'needs_reauth') {
    status = 'needs_reauth';
    message = 'La cuenta perdió el permiso de acceso. Hay que volver a conectarla desde Canales.';
  } else if (consecutiveFailures >= 2) {
    status = 'failing';
    message = `Las últimas ${consecutiveFailures} sincronizaciones automáticas fallaron.`;
  } else if (!finished.length) {
    status = 'unknown';
    message = 'Todavía no hay sincronizaciones automáticas registradas.';
  } else if (!lastOk || nowMs - new Date(lastOk.finished_at || lastOk.started_at).getTime() > SYNC_STALE_HOURS * 3_600_000) {
    status = 'stale';
    message = 'Hace más de un día que la sincronización automática no termina bien.';
  } else if (last?.status !== 'ok') {
    status = 'warning';
    message = last.status === 'partial'
      ? 'La última sincronización automática terminó incompleta.'
      : 'La última sincronización automática falló; se reintenta en la próxima corrida.';
  }

  return {
    connectionId: connection.id,
    provider: connection.provider,
    displayName: connection.displayName,
    status,
    message,
    consecutiveFailures,
    lastRunAt: last?.started_at || null,
    lastRunStatus: last?.status || null,
    lastError: last && last.status !== 'ok' ? last.error || null : null,
    lastOkAt: lastOk?.finished_at || lastOk?.started_at || null,
  };
}

export async function listWorkspaceSyncHealth(db, workspaceId, { now = new Date(), runsPerConnection = 5 } = {}) {
  await ensureSyncRunsSchema(db);
  const connections = (await db.execute({
    sql: `SELECT id, provider, external_store_id, display_name, auth_error, auth_error_at
          FROM workspace_integration_connections
          WHERE workspace_id = ? AND is_active = 1 AND provider IN ('mercadolibre', 'tiendanube')
          ORDER BY id`,
    args: [Number(workspaceId)],
  })).rows;
  const health = [];
  for (const row of connections) {
    const runs = (await db.execute({
      sql: `SELECT status, error, started_at, finished_at FROM integration_sync_runs
            WHERE connection_id = ? AND job = ? ORDER BY started_at DESC, id DESC LIMIT ?`,
      args: [Number(row.id), HEALTH_JOB_BY_PROVIDER[row.provider], runsPerConnection],
    })).rows;
    health.push(summarizeConnectionHealth({
      id: Number(row.id),
      provider: row.provider,
      displayName: row.display_name || row.external_store_id,
      authError: row.auth_error || null,
    }, runs, { now }));
  }
  return health;
}
