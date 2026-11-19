import { createClient } from '@libsql/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { productionDatabaseConfig } from './database-env.mjs';
import { carrierConfigScope } from '../src/lib/globalCarrierConfig.js';
import { exportWorkspace } from '../src/lib/workspaceExport.js';

// Uso: node scripts/export-workspace.mjs --workspace <id>            (solo cuenta filas)
//      node scripts/export-workspace.mjs --workspace <id> --write    (escribe _backup/exports/…json)
// Solo lectura sobre la base. Revisar el archivo antes de entregarlo; no incluye credenciales de integraciones.
const args = process.argv.slice(2);
const workspaceId = Number(args[args.indexOf('--workspace') + 1]);
if (!workspaceId) { console.error('Indicá --workspace <id>'); process.exit(2); }
const db = createClient(productionDatabaseConfig({ readOnly: true }));
try {
  const scope = await carrierConfigScope(workspaceId, db);
  const result = await exportWorkspace(db, { workspaceId, carrierScope: scope });
  const counts = Object.fromEntries(Object.entries(result.tables).map(([name, rows]) => [name, rows.length]));
  console.log(JSON.stringify({ workspaceId, counts, omittedColumns: result.omittedColumns, skippedTables: result.skippedTables }));
  if (args.includes('--write')) {
    const dir = resolve('_backup/exports'); mkdirSync(dir, { recursive: true });
    const file = resolve(dir, `espacio-${workspaceId}-${new Date().toISOString().slice(0, 10)}.json`);
    writeFileSync(file, JSON.stringify(result, null, 1), { flag: 'wx' });
    console.log(`Escrito: ${file}`);
  }
} finally { db.close(); }
