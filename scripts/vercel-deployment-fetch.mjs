import { spawnSync } from 'node:child_process';

// La URL de inspección está protegida por Vercel. Usar la sesión del CLI para
// verificarla sin desactivar esa protección ni exponer secretos al operador.
export function vercelDeploymentFetch(deploymentUrl, cwd) {
  const base = new URL(deploymentUrl);
  return async (url, options = {}) => {
    if (url.origin !== base.origin) throw new Error('URL fuera del despliegue a verificar');
    const args = ['curl', `${url.pathname}${url.search}`, '--deployment', base.origin,
      '--', '--silent', '--show-error', '--include', '--max-time', '20'];
    for (const [key, value] of Object.entries(options.headers || {})) args.push('--header', `${key}:${value}`);
    const result = spawnSync('vercel', args, { cwd, encoding: 'utf8', shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 2 * 1024 * 1024 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('No se pudo inspeccionar el despliegue con la sesión de Vercel');
    return parseCurlResponse(result.stdout);
  };
}

export function parseCurlResponse(raw) {
  const text = raw.replace(/\r\n/g, '\n');
  const blocks = [...text.matchAll(/^HTTP\/[\d.]+ (\d{3})[^\n]*\n/gm)];
  const last = blocks.at(-1);
  if (!last) throw new Error('Respuesta HTTP de inspección inválida');
  const start = last.index + last[0].length, end = text.indexOf('\n\n', start);
  if (end < 0) throw new Error('Cabeceras HTTP incompletas');
  const headers = new Headers();
  for (const line of text.slice(start, end).split('\n')) {
    const separator = line.indexOf(':');
    if (separator > 0) headers.append(line.slice(0, separator), line.slice(separator + 1).trim());
  }
  return new Response(text.slice(end + 2), { status: Number(last[1]), headers });
}
