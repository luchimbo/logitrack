import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { offerStoreConfig } from '../src/lib/crossselling/offer-store.js';
import { exportRedis } from '../src/lib/redisBackup.js';

// Solo lectura. Requiere KV_REST_API_URL/TOKEN (o UPSTASH_REDIS_REST_*) en la terminal; no se leen de Vercel ni se imprimen.
// Contiene datos de carritos: se guarda en _backup/redis (fuera de Git). Cifrar o guardar con las mismas precauciones que la base.
const config = offerStoreConfig();
if (!config?.url || !config?.token) { console.error('Faltan KV_REST_API_URL y KV_REST_API_TOKEN en el entorno de esta terminal.'); process.exit(2); }
const result = await exportRedis({ url: config.url, token: config.token });
const dir = resolve('_backup/redis'); mkdirSync(dir, { recursive: true });
const file = resolve(dir, `redis-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify(result), { flag: 'wx' });
console.log(JSON.stringify({ file, keys: result.count, unsupported: result.unsupported.length }));
