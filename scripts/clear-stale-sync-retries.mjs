import { createClient } from '@libsql/client';
import { productionDatabaseConfig } from './database-env.mjs';

// Elimina SOLO reintentos de ml_sync_retries que cumplan todo: sin actividad hace 7+ días, la orden ya está guardada
// en mercadolibre_orders y es una venta sin envío (la causa corregida en c98203b). Simulación por defecto.
//   node scripts/clear-stale-sync-retries.mjs                       -> lista cantidades (solo lectura)
//   node scripts/clear-stale-sync-retries.mjs --apply --backup-verified
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
if (apply && !args.has('--backup-verified')) { console.error('Rechazado: --apply requiere --backup-verified.'); process.exit(2); }
const WHERE = `updated_at < datetime('now','-7 days') AND EXISTS (
  SELECT 1 FROM mercadolibre_orders o WHERE o.order_id = ml_sync_retries.order_id AND (o.shipment_id IS NULL OR o.shipment_id = ''))`;
const db = createClient(productionDatabaseConfig({ readOnly: !apply }));
try {
  const total = Number((await db.execute('SELECT count(*) n FROM ml_sync_retries')).rows[0].n);
  const matching = Number((await db.execute(`SELECT count(*) n FROM ml_sync_retries WHERE ${WHERE}`)).rows[0].n);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', total, matching, untouched: total - matching }));
  if (apply) {
    const tx = await db.transaction('write');
    try {
      const result = await tx.execute(`DELETE FROM ml_sync_retries WHERE ${WHERE}`);
      if (result.rowsAffected !== matching) throw new Error('La cantidad eliminada no coincide con la prevista');
      await tx.commit();
      console.log(JSON.stringify({ deleted: result.rowsAffected }));
    } catch (error) { try { await tx.rollback(); } catch {} throw error; }
  }
} finally { db.close(); }
