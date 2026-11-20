import { createClient } from '@libsql/client';
import { basename, dirname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { migrateCarrierReferences } from '../src/lib/carrierScopeMigration.js';

const filename = resolve(process.argv[2] || '');
const parent = dirname(filename);
const tempRoot = resolve(tmpdir()) + sep;
if (!parent.toLowerCase().startsWith(tempRoot.toLowerCase()) || !basename(parent).startsWith('geomodi-restore-check-') || basename(filename) !== 'data') {
  throw new Error('La simulación requiere una copia temporal de verificación');
}
const db = createClient({ url:pathToFileURL(filename).href });
try {
  const tx=await db.transaction('write');
  try {
    const plan=await migrateCarrierReferences(tx,{apply:true});
    const remaining=await migrateCarrierReferences(tx);
    if (remaining.length) throw new Error('La simulación dejó referencias sin migrar');
    await tx.commit();
    const check=await db.execute('PRAGMA integrity_check');
    if (check.rows[0].integrity_check !== 'ok') throw new Error('La copia migrada no pasó integridad');
    console.log(`Migración simulada: ${plan.length} transportistas, integridad correcta`);
  } catch (error) { try { await tx.rollback(); } catch {} throw error; }
} finally { db.close(); }
