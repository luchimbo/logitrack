import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function sandboxEnvironment(source = process.env, root = process.cwd()) {
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'LANG']) {
    if (source[key] !== undefined) env[key] = source[key];
  }
  // Empty keys take precedence over the Next.js dotenv loader, including keys added in future.
  for (const file of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    let contents;
    try { contents = readFileSync(resolve(root, file), 'utf8'); } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (match) env[match[1]] = '';
    }
  }
  const publishableKey = source.GEOMODI_SANDBOX_CLERK_PUBLISHABLE_KEY || '';
  const secretKey = source.GEOMODI_SANDBOX_CLERK_SECRET_KEY || '';
  if (!publishableKey.startsWith('pk_test_') || !secretKey.startsWith('sk_test_')) {
    throw new Error('Configurá GEOMODI_SANDBOX_CLERK_PUBLISHABLE_KEY y GEOMODI_SANDBOX_CLERK_SECRET_KEY con claves de prueba de Clerk.');
  }
  env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = publishableKey;
  env.CLERK_SECRET_KEY = secretKey;
  env.DATABASE_URL = pathToFileURL(resolve(root, '.sandbox/geomodi.db')).href;
  env.DATABASE_AUTH_TOKEN = 'local-sandbox';
  env.DATABASE_READONLY_AUTH_TOKEN = 'local-sandbox';
  env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  env.GEOMODI_SANDBOX = '1';
  env.NODE_OPTIONS = '--dns-result-order=ipv4first';
  return env;
}
