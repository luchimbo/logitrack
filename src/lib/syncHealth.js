// Acumulación de reintentos de sincronización. Solo lectura.
export const SYNC_LIMITS = { maxPending: 200, overdueMinutes: 120, maxAttempts: 10 };

export async function syncBacklog(connection, { now = new Date(), limits = SYNC_LIMITS } = {}) {
  const cutoff = new Date(now.getTime() - limits.overdueMinutes * 60000).toISOString().replace('T', ' ').slice(0, 19);
  const result = {};
  for (const table of ['ml_sync_retries', 'ml_notification_retries']) {
    const exists = (await connection.execute({ sql: "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", args: [table] })).rows.length;
    if (!exists) { result[table] = { missing: true }; continue; }
    const row = (await connection.execute({ sql: `SELECT count(*) AS pending, COALESCE(SUM(next_attempt_at < ?),0) AS overdue, COALESCE(MAX(attempts),0) AS maxAttempts FROM ${table}`, args: [cutoff] })).rows[0];
    result[table] = { pending: Number(row.pending), overdue: Number(row.overdue), maxAttempts: Number(row.maxAttempts) };
  }
  const problems = [];
  for (const [table, v] of Object.entries(result)) {
    if (v.missing) continue;
    if (v.pending > limits.maxPending) problems.push(`${table}: ${v.pending} reintentos pendientes`);
    if (v.overdue > 0) problems.push(`${table}: ${v.overdue} reintentos vencidos hace más de ${limits.overdueMinutes} min`);
    if (v.maxAttempts >= limits.maxAttempts) problems.push(`${table}: reintentos con ${v.maxAttempts} intentos`);
  }
  return { result, problems };
}
