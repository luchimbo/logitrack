// Sólo lectura. No crea promociones, no registra callbacks y no modifica la base.
// node --env-file=.env.local scripts/probar-crossselling.mjs --store=7570182 --production [--inspect-pending]
import { createClient } from '@libsql/client';
import { decrypt } from '../src/lib/cryptoUtils.js';
import { createTiendanubeClient } from '../src/lib/tiendanubeClient.js';

const storeId = process.argv.find((a) => a.startsWith('--store='))?.split('=')[1] || '7570182';
if (!/^\d+$/.test(storeId)) throw new Error('ID de tienda inválido');
const suffix = process.argv.includes('--production') ? '_PROD' : '';
const url = process.env[`TURSO_DATABASE_URL${suffix}`], authToken = process.env[`TURSO_AUTH_TOKEN${suffix}`];
if (!url || !authToken) throw new Error('Faltan credenciales de base de datos en el entorno');
const db = createClient({ url, authToken });
try {
  let found;
  for (const table of ['workspace_integration_connections', 'workspace_integrations']) {
    const result = await db.execute(`SELECT workspace_id,config_json FROM ${table} WHERE provider='tiendanube' AND is_active=1`);
    for (const row of result.rows) {
      const config = JSON.parse(decrypt(row.config_json));
      if (String(config.storeId) === storeId) { found = { workspaceId: Number(row.workspace_id), config }; break; }
    }
    if (found) break;
  }
  if (!found && process.argv.includes('--inspect-pending')) {
    const result = await db.execute({ sql: 'SELECT access_token,scope,expires_at FROM tiendanube_oauth_sessions WHERE store_id=?', args: [storeId] });
    const pending = result.rows[0];
    if (pending) found = { workspaceId: null, pending: true, expired: Date.parse(pending.expires_at) <= Date.now(),
      config: { accessToken: pending.access_token, scope: pending.scope } };
    // Sólo diagnóstico del token. Nunca vincular automáticamente una sesión vencida.
  }
  if (!found) {
    console.log(JSON.stringify({ storeId, ready: false, blocker: 'Tienda no conectada a Logitrack',
      next: 'Conectar la tienda desde Integraciones de Logitrack y verificar los permisos de promociones y scripts en Partners' }, null, 2));
    process.exitCode = 2;
  } else {
    const client = createTiendanubeClient({ accessToken: found.config.accessToken, storeId });
    const checks = await Promise.allSettled([client.getStore(), client.listProducts({ perPage: 1 }), client.listPromotions()]);
    const report = { storeId, workspaceId: found.workspaceId, connectionState: found.pending ? (found.expired ? 'pending-expired' : 'pending') : 'connected', scopes: found.config.scope || '', checks: {} };
    for (const [i, name] of ['store', 'catalog', 'promotions'].entries()) {
      const result = checks[i];
      report.checks[name] = result.status === 'fulfilled' ? { ok: true } : { ok: false, httpStatus: result.reason?.status || null };
    }
    report.scriptsPermission = String(found.config.scope || '').split(/[\s,]+/).includes('scripts');
    report.ready = false; // Falta, además, validar aplicación y retirada en un checkout real de prueba.
    report.liveCheckoutTest = 'pending';
    console.log(JSON.stringify(report, null, 2));
    if (checks.some((r) => r.status === 'rejected')) process.exitCode = 2;
  }
} catch (error) {
  console.error(`No se pudo comprobar la integración${error.status ? ` (HTTP ${error.status})` : ''}. Revisá el acceso a la base y a Tiendanube.`);
  process.exitCode = 2;
} finally { db.close(); }
