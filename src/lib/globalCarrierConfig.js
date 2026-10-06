import { db } from "./db";

// La configuración de transportistas es única para toda la aplicación.
// Usamos un scope reservado en las tablas existentes para no atarla a ningún
// usuario/workspace y para conservar los IDs que usan los portales externos.
export const GLOBAL_CARRIER_CONFIG_SCOPE = 0;

async function migrateTableIfNeeded(tableName) {
  const globalRows = await db.execute({
    sql: `SELECT 1 FROM ${tableName} WHERE workspace_id = ? LIMIT 1`,
    args: [GLOBAL_CARRIER_CONFIG_SCOPE],
  });
  if (globalRows.rows.length) return;

  // En instalaciones existentes, GeoModi/legacy es la fuente canónica. Si no
  // existe, preservamos la configuración más antigua disponible.
  const source = await db.execute({
    sql: `SELECT t.workspace_id
          FROM ${tableName} t
          LEFT JOIN workspaces w ON w.id = t.workspace_id
          WHERE t.workspace_id IS NOT NULL AND t.workspace_id <> ?
          GROUP BY t.workspace_id
          ORDER BY CASE WHEN w.slug = 'legacy' THEN 0 ELSE 1 END, MIN(t.id)
          LIMIT 1`,
    args: [GLOBAL_CARRIER_CONFIG_SCOPE],
  });
  if (!source.rows.length) return;

  await db.execute({
    sql: `UPDATE ${tableName} SET workspace_id = ? WHERE workspace_id = ?`,
    args: [GLOBAL_CARRIER_CONFIG_SCOPE, source.rows[0].workspace_id],
  });
}

export async function ensureGlobalCarrierConfig() {
  await migrateTableIfNeeded("carriers");
  await migrateTableIfNeeded("zone_mappings");
}
