import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkCrossSellingDeployment } from './check-crossselling-deployment.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const projectId = 'prj_whyqDb9sDWCJ1VrBcY3cNxWr5pOJ';
const orgId = 'team_esmSeA8KK9btqWR2jA3X6Pkm';
let linked;
try { linked = JSON.parse(readFileSync(new URL('../.vercel/project.json', import.meta.url))); }
catch { throw new Error('Vinculá esta carpeta al proyecto Vercel logitrack antes de desplegar.'); }
if (linked.projectId !== projectId || linked.orgId !== orgId) {
  throw new Error('Proyecto Vercel incorrecto. GeoModi usa logitrack, no logitrack-tan. Ejecutá vercel link --project logitrack y volvé a intentar.');
}
function run(command, args, env = process.env, capture = false) {
  const result = spawnSync(command, args, { cwd: root, env,
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8',
    shell: process.platform === 'win32', maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
  return result.stdout;
}
run('npm', ['run', 'check:crossselling']);
const env = { ...process.env, VERCEL_PROJECT_ID: projectId, VERCEL_ORG_ID: orgId };
const output = run('vercel', ['deploy', '--prod', '--skip-domain'], env, true);
const deploymentUrl = output.trim().split(/\s+/).findLast((value) => /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(value));
if (!deploymentUrl) throw new Error('No se recibió la URL del despliegue. No se promovió ningún dominio.');
console.log(`Verificando ${deploymentUrl} antes de promoverlo a producción…`);
await checkCrossSellingDeployment(deploymentUrl);
run('vercel', ['promote', deploymentUrl], env);
