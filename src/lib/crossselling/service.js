import { validateSnapshot, mapOnlineCatalog, onlineRecommendations } from './engine/online-crossselling.js';
import { snapshotRevision } from './engine/publish-protocol.js';

const failure = (message, status = 400) => Object.assign(new Error(message), { status });

// Esta primera etapa no activa promociones: la prueba real de TN es un requisito.
export function publicStatus(record) {
  if (!record) return { published: false, ready: false, enabled: false, stage: 'requires-tiendanube-test' };
  return { published: true, storeId: record.storeId, revision: record.revision, publishedAt: record.publishedAt,
    requestedEnabled: record.snapshot.enabled, enabled: false, ready: false, stage: 'requires-tiendanube-test',
    selectedRules: record.snapshot.ruleIds.length, ...record.diagnostics };
}

export function createCrossSellingService({ repository, lookupConnection, clientFor, now = () => new Date() }) {
  async function connection(storeId) {
    const c = await lookupConnection(String(storeId));
    if (!c?.workspaceId || !c.config?.accessToken || String(c.config.storeId) !== String(storeId))
      throw failure('Conectá esta tienda a Logitrack antes de publicar', 409);
    return c;
  }
  async function publish(storeId, input) {
    const snapshot = validateSnapshot(input?.snapshot);
    if (snapshot.storeId !== String(storeId) || input.revision !== snapshotRevision(snapshot)) throw failure('Tienda o versión de publicación inválida');
    const age = now().getTime() - Date.parse(snapshot.generatedAt);
    if (age > 24 * 60 * 60_000 || age < -5 * 60_000) throw failure('Fecha de publicación inválida');
    const c = await connection(storeId);
    const client = clientFor(c);
    const [store, catalog, promotions] = await Promise.all([client.getStore(), client.downloadCatalog(),
      client.listPromotions().then(() => ({ accessible: true })).catch((e) => ({ accessible: false, httpStatus: e.status || null }))]);
    if (String(store.id) !== String(storeId)) throw failure('La conexión devolvió una tienda distinta', 409);
    const mapped = mapOnlineCatalog(snapshot, catalog);
    const scopes = String(c.config.scope || '').split(/[\s,]+/).filter(Boolean);
    const scriptsPermission = scopes.includes('scripts') || scopes.includes('write_scripts');
    const diagnostics = { mappedProducts: mapped.productsById.size, excluded: mapped.excluded,
      promotionsAccessible: promotions.accessible, promotionsHttpStatus: promotions.httpStatus || null,
      scriptsPermission, domain: store.original_domain || store.url_with_protocol || null,
      blockers: ['Falta validar aplicación y retirada de descuentos en la tienda de prueba',
        ...(!promotions.accessible ? ['La API de promociones no está accesible'] : []),
        ...(!scriptsPermission ? ['Falta verificar el permiso scripts en Partners'] : [])] };
    return publicStatus(await repository.save({ storeId: String(storeId), workspaceId: c.workspaceId,
      revision: input.revision, snapshot, catalog, diagnostics, publishedAt: now().toISOString() }));
  }
  async function status(storeId) {
    const c = await connection(storeId);
    const record = await repository.get(storeId);
    if (record && record.workspaceId !== Number(c.workspaceId)) throw failure('Configuración de otro espacio', 409);
    return publicStatus(record);
  }
  // Diagnóstico interno; no devuelve costos ni habilita descuentos reales.
  async function preview(storeId, cart) {
    await status(storeId);
    const record = await repository.get(storeId);
    if (!record) throw failure('Primero publicá la configuración', 409);
    return onlineRecommendations(record.snapshot, mapOnlineCatalog(record.snapshot, record.catalog), cart);
  }
  return { publish, status, preview };
}
