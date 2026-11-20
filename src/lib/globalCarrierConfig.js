import { db } from "./db.js";

// El scope 0 conserva la configuración histórica del espacio legacy y sus enlaces.
export const GLOBAL_CARRIER_CONFIG_SCOPE = 0;

async function migrateTableIfNeeded(tableName, connection = db) {
  const globalRows = await connection.execute({
    sql: `SELECT 1 FROM ${tableName} WHERE workspace_id = ? LIMIT 1`,
    args: [GLOBAL_CARRIER_CONFIG_SCOPE],
  });
  if (globalRows.rows.length) return;

  // Solo se migra el espacio legacy; nunca se toman datos de otro comercio.
  const source = await connection.execute({
    sql: `SELECT t.workspace_id
          FROM ${tableName} t
          LEFT JOIN workspaces w ON w.id = t.workspace_id
          WHERE t.workspace_id IS NOT NULL AND t.workspace_id <> ? AND w.slug = 'legacy'
          GROUP BY t.workspace_id
          ORDER BY CASE WHEN w.slug = 'legacy' THEN 0 ELSE 1 END, MIN(t.id)
          LIMIT 1`,
    args: [GLOBAL_CARRIER_CONFIG_SCOPE],
  });
  if (!source.rows.length) return;

  await connection.execute({
    sql: `UPDATE ${tableName} SET workspace_id = ? WHERE workspace_id = ?`,
    args: [GLOBAL_CARRIER_CONFIG_SCOPE, source.rows[0].workspace_id],
  });
}

export async function ensureGlobalCarrierConfig(connection = db) {
  await migrateTableIfNeeded("carriers", connection);
  await migrateTableIfNeeded("zone_mappings", connection);
}

// El espacio legacy conserva los IDs y enlaces existentes; los demás son independientes.
export async function carrierConfigScope(workspaceId, connection = db) {
  const id = Number(workspaceId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Espacio inválido');
  const result = await connection.execute({ sql: 'SELECT slug FROM workspaces WHERE id = ? LIMIT 1', args: [id] });
  if (!result.rows.length) throw new Error('Espacio no encontrado');
  if (result.rows[0].slug === 'legacy') {
    await ensureGlobalCarrierConfig(connection);
    return GLOBAL_CARRIER_CONFIG_SCOPE;
  }
  return id;
}
