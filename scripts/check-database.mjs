import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { databaseConfig } from '../src/lib/databaseConfig.js';
import { loadDatabaseEnv } from './database-env.mjs';

const env = loadDatabaseEnv();
const production = process.argv.includes('--production');
const config = databaseConfig(env, { production });
const rw = createClient(config);
const ro = createClient(databaseConfig(env, { production, readOnly: true }));
try {
  await rw.execute('SELECT 1');
  const result = await ro.execute("SELECT COUNT(*) AS tables FROM sqlite_master WHERE type='table'");
  if (Number(result.rows[0].tables) < 1) throw new Error('La base está vacía');
  // Nombre único para poder limpiar solo la tabla creada por esta comprobación.
  const probe = `__geomodi_ro_check_${randomUUID().replaceAll("-", "")}`;
  let denied = false;
  try { await ro.execute(`CREATE TABLE ${probe} (id INTEGER)`); }
  catch (error) {
    if (error.cause?.status !== 403 && !/read.?only|not authorized|not allowed|SQLITE_AUTH/i.test(`${error.code} ${error.message}`)) throw error;
    denied = true;
  }
  if (!denied) {
    await rw.execute(`DROP TABLE ${probe}`);
    throw new Error('El token de solo lectura permitió escritura');
  }
  const response = await fetch(new URL('/v2/pipeline', config.url), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql: 'SELECT 1' } }] }),
    signal: AbortSignal.timeout(15000),
  });
  if (response.status !== 401) throw new Error(`Acceso anónimo inesperado: HTTP ${response.status}`);
  console.log(`PC MIDI: conexión, ${result.rows[0].tables} tablas, token RO y rechazo anónimo verificados.`);
} finally { rw.close(); ro.close(); }
