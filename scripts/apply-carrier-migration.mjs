import { createClient } from '@libsql/client';
import { productionDatabaseConfig } from './database-env.mjs';
import { migrateCarrierReferences } from '../src/lib/carrierScopeMigration.js';

// Uso: node scripts/apply-carrier-migration.mjs            -> simulación de solo lectura (por defecto)
//      node scripts/apply-carrier-migration.mjs --apply --backup-verified
// --apply escribe en producción: exige confirmar que existe un respaldo verificado reciente
// (ver docs/recuperacion.md). Todo ocurre en una transacción; ante cualquier error se revierte.
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
if (apply && !args.has('--backup-verified')) {
  console.error('Rechazado: --apply requiere --backup-verified (respaldo restaurado y verificado el mismo día).');
  process.exit(2);
}
const db = createClient(productionDatabaseConfig({ readOnly: !apply }));
try {
  if (!apply) {
    const plan = await migrateCarrierReferences(db);
    console.log(JSON.stringify({ mode: 'dry-run', mappings: plan.length, toCreate: plan.filter(x => !x.newId).length, existing: plan.filter(x => x.newId).length, workspaces: [...new Set(plan.map(x => x.workspaceId))] }));
  } else {
    const tx = await db.transaction('write');
    try {
      const plan = await migrateCarrierReferences(tx, { apply: true });
      if ((await migrateCarrierReferences(tx)).length) throw new Error('Quedaron referencias sin migrar');
      await tx.commit();
      console.log(JSON.stringify({ mode: 'applied', mappings: plan.length }));
    } catch (error) { try { await tx.rollback(); } catch {} throw error; }
  }
} finally { db.close(); }
