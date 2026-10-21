import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// Sólo lectura y sin credenciales: distingue la autorización HMAC del 401 de Clerk.
// No consulta carritos, no activa promociones y no cambia datos de la tienda.
export async function checkCrossSellingDeployment(baseUrl, fetchImpl = fetch) {
  const base = new URL(baseUrl);
  for (const endpoint of ['config', 'module', 'report']) {
    const response = await fetchImpl(new URL(`/api/cross-selling/${endpoint}?storeId=78394`, base), {
      redirect: 'error', signal: AbortSignal.timeout(20_000),
    });
    assert.equal(response.status, 401, `${endpoint}: debe rechazar la solicitud sin firma`);
    const body = await response.json();
    assert.equal(body.error, endpoint === 'config' ? 'Publicación no autorizada' : 'Solicitud no autorizada',
      `${endpoint}: la solicitud debe llegar al handler HMAC, sin quedar bloqueada por Clerk`);
  }
  for (const [store, origin] of [
    ['78394', 'https://www.pcmidi.com.ar'], ['78394', 'https://pcmidi.com.ar'],
    ['78394', 'https://tiendahsr.mitiendanube.com'], ['7570182', 'https://logitrackprueba.mitiendanube.com'],
  ]) {
    const response = await fetchImpl(new URL(`/api/cross-selling/storefront/offers?store=${store}`, base), {
      headers: { Origin: origin }, redirect: 'error', signal: AbortSignal.timeout(20_000),
    });
    assert.equal(response.status, 200, `Ofertas: tienda ${store}, origen ${origin}`);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.deepEqual(await response.json(), { offers: [] });
  }
  const denied = await fetchImpl(new URL('/api/cross-selling/storefront/offers?store=78394', base), {
    headers: { Origin: 'https://example.org' }, redirect: 'error', signal: AbortSignal.timeout(20_000),
  });
  assert.equal(denied.status, 403, 'Un dominio ajeno debe seguir bloqueado');
  const script = await fetchImpl(new URL('/cross-selling/completa-tu-equipo.js', base), {
    redirect: 'error', signal: AbortSignal.timeout(20_000),
  });
  assert.equal(script.status, 200, 'El recurso del storefront debe estar disponible');
  assert.ok((await script.text()).includes('/api/cross-selling/storefront/'), 'Respuesta de script inválida');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Uso: node scripts/check-crossselling-deployment.mjs <URL>');
  await checkCrossSellingDeployment(process.argv[2]);
  console.log('Cross-selling: rutas HMAC, dominios de ambas tiendas y script verificados.');
}
