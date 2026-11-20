import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { PCMIDI_DATABASE_URL } from '../src/lib/databaseConfig.js';

const projectId = 'prj_whyqDb9sDWCJ1VrBcY3cNxWr5pOJ';
const teamId = 'team_esmSeA8KK9btqWR2jA3X6Pkm';
const project = JSON.parse(readFileSync(new URL('../.vercel/project.json', import.meta.url), 'utf8'));
if (project.projectId !== projectId || project.orgId !== teamId) throw new Error('El proyecto debe ser logitrack.');
if (!process.argv.includes('--apply')) throw new Error('Usá --apply para configurar PC MIDI en .env.local y Vercel.');
const token = name => execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'pcmidi', `cat services/geomodi-libsql/keys/${name}`], {
  encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const values = {
  DATABASE_URL: PCMIDI_DATABASE_URL,
  DATABASE_AUTH_TOKEN: token('app-rw.jwt'),
  DATABASE_READONLY_AUTH_TOKEN: token('portal-ro.jwt'),
};
for (const key of ['DATABASE_AUTH_TOKEN', 'DATABASE_READONLY_AUTH_TOKEN']) {
  const db = createClient({ url: values.DATABASE_URL, authToken: values[key] });
  try { await db.execute('SELECT 1'); } finally { db.close(); }
}
const endpoint = `/v10/projects/${projectId}/env?teamId=${teamId}&upsert=true`;
const tempDir = mkdtempSync(join(tmpdir(), 'geomodi-db-env-'));
const inputFile = join(tempDir, 'env.json');
try {
  for (const [key, value] of Object.entries(values)) {
    writeFileSync(inputFile, JSON.stringify({ key, value, type: 'sensitive', target: ['production', 'preview'] }), { mode: 0o600 });
    const result = spawnSync('vercel', ['api', process.platform === 'win32' ? `"${endpoint}"` : endpoint, '-X', 'POST', '--input', process.platform === 'win32' ? `"${inputFile}"` : inputFile, '--raw'], {
      shell: process.platform === 'win32', windowsHide: true, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    // No imprimir respuestas del API: pueden contener valores o credenciales.
    if (result.error || result.status !== 0) {
      let detail = result.stderr || result.error?.message || 'Error del API';
      for (const secret of Object.values(values)) detail = detail.replaceAll(secret, '[oculto]');
      throw new Error(`No se pudo configurar ${key} en Vercel. No se modificó .env.local. ${detail}`);
    }
  }
} finally { rmSync(inputFile, { force: true }); rmdirSync(tempDir); }
const envFile = new URL('../.env.local', import.meta.url);
let contents = readFileSync(envFile, 'utf8').split(/\r?\n/).filter(line => !/^\s*(TURSO_|DATABASE_(URL|AUTH_TOKEN|READONLY_AUTH_TOKEN)(?:_PROD)?\s*=)/.test(line)).join('\n');
contents += '\n# libSQL operativo de PC MIDI; mismas claves existentes del servidor.\n';
for (const [key, value] of Object.entries(values)) contents += `${key}=${JSON.stringify(value)}\n`;
writeFileSync(envFile, contents);
console.log('PC MIDI verificado; DATABASE_* configuradas en logitrack (Production/Preview) y .env.local. No se cambiaron claves ni datos.');
