import { createClient } from '@libsql/client';
import { productionDatabaseConfig } from './database-env.mjs';
import { syncBacklog } from '../src/lib/syncHealth.js';

// Solo lectura. Código de salida 1 si hay reintentos acumulados, vencidos o agotados.
const db = createClient(productionDatabaseConfig({ readOnly: true }));
try {
  const { result, problems } = await syncBacklog(db);
  console.log(JSON.stringify(result));
  problems.forEach(p => console.log(`ERROR: ${p}`));
  process.exitCode = problems.length ? 1 : 0;
} finally { db.close(); }
