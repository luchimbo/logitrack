// Estado de un trabajo largo por espacio (por ejemplo, descargar el catálogo de ML).
// El pedido responde enseguida y el trabajo sigue con after(); la pantalla consulta el estado.
// Recibe la conexión a la base: se puede probar sin la base real.

// Pasado este tiempo un trabajo "running" se considera cortado (límite de 300 s de Vercel).
export const JOB_STALE_MS = 6 * 60_000;

const SCHEMA = `CREATE TABLE IF NOT EXISTS workspace_background_jobs (
  workspace_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  result_json TEXT,
  error TEXT,
  PRIMARY KEY (workspace_id, kind)
)`;

const ready = new WeakMap();
async function ensureSchema(db) {
  if (!ready.has(db)) ready.set(db, db.execute(SCHEMA).catch((error) => { ready.delete(db); throw error; }));
  return ready.get(db);
}

function mapRow(row, now) {
  if (!row) return null;
  const stale = row.status === 'running' && new Date(now).getTime() - new Date(row.started_at).getTime() > JOB_STALE_MS;
  let result = null;
  try { result = row.result_json ? JSON.parse(row.result_json) : null; } catch { result = null; }
  return {
    status: stale ? 'error' : row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at || null,
    result,
    error: stale ? 'El trabajo se cortó antes de terminar. Volvé a intentar.' : row.error || null,
  };
}

export async function readBackgroundJob(db, workspaceId, kind, { now = new Date() } = {}) {
  await ensureSchema(db);
  const row = (await db.execute({
    sql: 'SELECT status, started_at, finished_at, result_json, error FROM workspace_background_jobs WHERE workspace_id = ? AND kind = ?',
    args: [Number(workspaceId), kind],
  })).rows[0];
  return mapRow(row, now);
}

// Devuelve { started: false, job } si ya hay uno corriendo: un segundo clic no duplica el trabajo.
export async function claimBackgroundJob(db, workspaceId, kind, { now = new Date() } = {}) {
  await ensureSchema(db);
  const startedAt = new Date(now).toISOString();
  const staleBefore = new Date(new Date(now).getTime() - JOB_STALE_MS).toISOString();
  const result = await db.execute({
    sql: `INSERT INTO workspace_background_jobs (workspace_id, kind, status, started_at) VALUES (?, ?, 'running', ?)
          ON CONFLICT(workspace_id, kind) DO UPDATE SET status = 'running', started_at = excluded.started_at,
            finished_at = NULL, result_json = NULL, error = NULL
          WHERE workspace_background_jobs.status != 'running' OR workspace_background_jobs.started_at < ?`,
    args: [Number(workspaceId), kind, startedAt, staleBefore],
  });
  const job = await readBackgroundJob(db, workspaceId, kind, { now });
  return { started: Number(result.rowsAffected || 0) > 0, job };
}

export async function finishBackgroundJob(db, workspaceId, kind, { result = null, error = null, now = new Date() } = {}) {
  await db.execute({
    sql: `UPDATE workspace_background_jobs SET status = ?, finished_at = ?, result_json = ?, error = ?
          WHERE workspace_id = ? AND kind = ?`,
    args: [error ? 'error' : 'done', new Date(now).toISOString(), result == null ? null : JSON.stringify(result),
      error ? String(error?.message || error).slice(0, 500) : null, Number(workspaceId), kind],
  });
}
