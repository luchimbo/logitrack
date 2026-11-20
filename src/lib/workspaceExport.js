// Exportación de los datos de UN espacio. Lista cerrada de tablas, filtro por workspace_id
// y exclusión de columnas que contengan credenciales. Nunca lee tablas de otros espacios.
export const EXPORT_TABLES = [
  'shipments', 'shipment_finance', 'daily_batches', 'carrier_rates', 'carrier_settlements',
  'mercadolibre_orders', 'tiendanube_orders', 'shopify_orders', 'zipnova_shipments',
  'workspace_members', 'workspace_settings', 'audit_logs',
];
// Se filtran por el alcance de configuración (el espacio legacy usa 0).
export const SCOPED_TABLES = ['carriers', 'zone_mappings'];
const SENSITIVE_COLUMN = /token|secret|password|passwd|api_?key|credential|authorization|signature/i;

export async function exportWorkspace(connection, { workspaceId, carrierScope = workspaceId } = {}) {
  const id = Number(workspaceId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Espacio inválido');
  const tables = {}, omittedColumns = {}, skipped = [];
  for (const [name, scope] of [...EXPORT_TABLES.map(t => [t, id]), ...SCOPED_TABLES.map(t => [t, Number(carrierScope)])]) {
    const info = (await connection.execute(`PRAGMA table_info(${name})`)).rows;
    if (!info.some(c => c.name === 'workspace_id')) { skipped.push(name); continue; }
    const columns = info.map(c => String(c.name)).filter(c => !SENSITIVE_COLUMN.test(c));
    const removed = info.map(c => String(c.name)).filter(c => SENSITIVE_COLUMN.test(c));
    if (removed.length) omittedColumns[name] = removed;
    const rows = (await connection.execute({ sql: `SELECT ${columns.map(c => `"${c}"`).join(',')} FROM ${name} WHERE workspace_id = ?`, args: [scope] })).rows;
    tables[name] = rows.map(row => Object.fromEntries(columns.map(c => [c, row[c]])));
  }
  return { workspaceId: id, exportedAt: new Date().toISOString(), tables, omittedColumns, skippedTables: skipped };
}
