import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { databaseConfig } from '../src/lib/databaseConfig.js';

export function loadDatabaseEnv() {
  const file = new URL('../.env.local', import.meta.url);
  if (existsSync(file)) {
    for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
  return process.env;
}

export function productionDatabaseConfig({ readOnly = false } = {}) {
  return databaseConfig(loadDatabaseEnv(), { production: true, readOnly });
}
