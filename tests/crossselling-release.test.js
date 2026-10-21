import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { storeOrigins } from '../src/lib/crossselling/stores.js';
import { checkCrossSellingDeployment } from '../scripts/check-crossselling-deployment.mjs';

// Ejecutar el proxy real con dobles de Next/Clerk: detecta el 401 antes del handler,
// incluso si las pruebas de HMAC y del módulo siguen pasando por separado.
function loadProxy() {
  const source = readFileSync(new URL('../src/proxy.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace('export default function proxy', 'function proxy')
    .replace('export const config', 'const config');
  return runInNewContext(`${source}\nproxy;`, {
    URL,
    NextResponse: {
      next: () => ({ status: 200, next: true }),
      json: (body, options) => ({ ...options, body }),
      redirect: () => ({ status: 307 }),
    },
    clerkMiddleware: (handler) => (req) => handler(async () => ({ userId: null }), req),
    createRouteMatcher: () => () => false,
    legacyTiendanubeReturn: () => null,
    loginPath: (path) => path,
  });
}

test('release: Mostrador, storefront y callbacks llegan a su propia autorización sin sesión Clerk', async () => {
  const proxy = loadProxy();
  for (const path of [
    '/api/cross-selling/config', '/api/cross-selling/module', '/api/cross-selling/report',
    '/api/cross-selling/storefront/offers', '/api/cross-selling/storefront/accept',
    '/api/cross-selling/storefront/seen',
    `/api/cross-selling/offer-callback/${'a'.repeat(32)}`,
    `/api/cross-selling/demo-callback/${'a'.repeat(64)}`,
  ]) {
    const result = await proxy({ nextUrl: new URL(`https://www.geomodi.ai${path}?storeId=78394`) });
    assert.equal(result.next, true, path);
  }
});

test('release: las APIs administrativas y rutas parecidas conservan la protección de sesión', async () => {
  const proxy = loadProxy();
  for (const path of [
    '/api/admin/tiendanube/cross-selling/status', '/api/logistics-finance',
    '/api/cross-selling/module/admin', '/api/cross-selling/storefront/unknown',
    '/api/cross-selling/offer-callback/invalid', '/api/cross-selling/demo-callback/invalid',
  ]) assert.equal((await proxy({ nextUrl: new URL(`https://www.geomodi.ai${path}`) })).status, 401, path);
});

test('release: PC MIDI y la demo conservan sus dominios separados', () => {
  for (const origin of ['https://www.pcmidi.com.ar', 'https://pcmidi.com.ar', 'https://tiendahsr.mitiendanube.com']) {
    assert.ok(storeOrigins('78394').includes(origin), origin);
    assert.ok(!storeOrigins('7570182').includes(origin), origin);
  }
  assert.deepEqual(storeOrigins('99999'), []);
});

test('release: la distribución incluye las rutas y recursos comerciales de producción', () => {
  for (const file of [
    'src/app/api/cross-selling/module/route.js', 'src/app/api/cross-selling/report/route.js',
    'src/app/api/cross-selling/storefront/seen/route.js', 'src/lib/crossselling/offer-store.js',
    'src/lib/crossselling/online-sales.js', 'public/cross-selling/completa-tu-equipo.js',
  ]) assert.ok(readFileSync(new URL(`../${file}`, import.meta.url)).length > 0, file);
});

function deploymentFetch({ brokenModule = false, brokenOrigin = false } = {}) {
  return async (url, options) => {
    const endpoint = url.pathname.split('/').at(-1);
    if (['config', 'module', 'report'].includes(endpoint)) {
      return Response.json({ error: endpoint === 'config' ? 'Publicación no autorizada'
        : endpoint === 'module' && brokenModule ? 'No autorizado' : 'Solicitud no autorizada' }, { status: 401 });
    }
    if (endpoint === 'offers') {
      const origin = options.headers.Origin;
      if (origin === 'https://example.org' || brokenOrigin) return Response.json({ error: 'Origen inválido' }, { status: 403 });
      return Response.json({ offers: [] }, { headers: { 'Access-Control-Allow-Origin': origin } });
    }
    return new Response('fetch("/api/cross-selling/storefront/offers")');
  };
}

test('release: el control previo a promover admite una distribución completa', async () => {
  await checkCrossSellingDeployment('https://example.vercel.app', deploymentFetch());
});

test('release: el control previo a promover detecta el 401 de Clerk aunque el código HTTP sea el esperado', async () => {
  await assert.rejects(checkCrossSellingDeployment('https://example.vercel.app', deploymentFetch({ brokenModule: true })), /Clerk/);
});

test('release: el control previo a promover detecta la pérdida de los dominios de PC MIDI', async () => {
  await assert.rejects(checkCrossSellingDeployment('https://example.vercel.app', deploymentFetch({ brokenOrigin: true })), /78394/);
});
