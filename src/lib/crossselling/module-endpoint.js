import { STOREFRONT_STORES } from './stores.js';

// Encendido del módulo «Completá tu equipo» desde Mostrador, firmado igual que la publicación.
// Opera con el espacio dueño de la conexión de la tienda.
export const MODULE_STORES = new Set(Object.keys(STOREFRONT_STORES));
// Permisos de la app que usa el módulo: promociones y callback de descuentos, y scripts de la tienda.
export const REQUIRED_SCOPES = ['write_discounts', 'write_scripts'];
const SCRIPT_NAME = /complet[aá]?\s*tu\s*equipo|crossselling|cross-selling/i;

export function moduleSummary(status) {
  const promotion = status.promotions?.[0];
  const scripts = Array.isArray(status.scripts) ? status.scripts : [];
  const matching = scripts.filter((s) => SCRIPT_NAME.test(String(s.name || s.handle || s.src || '')));
  return {
    storeId: status.storeId,
    enabled: Boolean(status.state?.enabled && status.state?.promotionId && promotion?.active !== false),
    promotion: status.state?.promotionId ? { id: status.state.promotionId, found: Boolean(promotion), active: promotion ? promotion.active !== false : false } : null,
    // TN lista los scripts de la app aunque no estén asociados a la tienda: informar sólo si existe.
    script: status.scripts?.error ? { error: status.scripts.error } : { found: matching.length > 0, ids: matching.map((s) => s.id).filter(Boolean) },
    publication: status.publication ? { revision: status.publication.revision, publishedAt: status.publication.publishedAt,
      selectedRules: status.publication.selectedRules, mappedProducts: status.publication.mappedProducts } : null,
  };
}

export function createModuleHandler({ authorize, lookupConnection, offerStatus, changeOffer, stores = MODULE_STORES }) {
  return async function handle(request) {
    const headers = { 'Cache-Control': 'no-store' };
    try {
      if (Number(request.headers.get('content-length')) > 4096) return Response.json({ error: 'Solicitud demasiado grande' }, { status: 413, headers });
      const raw = request.method === 'GET' ? '' : await request.text();
      if (Buffer.byteLength(raw) > 4096) return Response.json({ error: 'Solicitud demasiado grande' }, { status: 413, headers });
      const storeId = authorize({ request, rawBody: raw });
      if (!storeId) return Response.json({ error: 'Solicitud no autorizada' }, { status: 401, headers });
      if (!stores.has(storeId)) return Response.json({ error: 'El módulo todavía no está habilitado para esta tienda' }, { status: 403, headers });
      const connection = await lookupConnection(storeId);
      const workspaceId = Number(connection?.workspaceId);
      if (!workspaceId || String(connection.config?.storeId) !== storeId) return Response.json({ error: 'Conectá esta tienda a Logitrack' }, { status: 409, headers });
      if (request.method === 'GET') {
        // Diagnóstico para Mostrador: espacio dueño y permisos de la app, sin tokens.
        const scopes = String(connection.config?.scope || '').split(/[\s,]+/).filter(Boolean);
        const info = { workspaceId, scopes, missingScopes: REQUIRED_SCOPES.filter((s) => !scopes.includes(s)) };
        try { return Response.json({ ...moduleSummary(await offerStatus(workspaceId, storeId)), connection: info }, { headers }); }
        catch (error) {
          const status = [400, 404, 409].includes(error.status) ? error.status : 502;
          return Response.json({ storeId, enabled: false, connection: info,
            error: status === 502 ? 'No se pudo consultar Tiendanube con esta conexión' : error.message }, { status, headers });
        }
      }
      const input = JSON.parse(raw);
      if (typeof input?.enabled !== 'boolean') return Response.json({ error: 'Indicá enabled: true o false' }, { status: 400, headers });
      return Response.json(moduleSummary(await changeOffer(workspaceId, { action: input.enabled ? 'enable' : 'disable' }, storeId)), { headers });
    } catch (error) {
      const status = error instanceof SyntaxError ? 400 : [400, 404, 409].includes(error.status) ? error.status : 502;
      // Los errores propios del módulo son mensajes para el operador; no reflejar respuestas de proveedores.
      return Response.json({ error: status === 502 ? 'No se pudo cambiar el módulo en Tiendanube' : error instanceof SyntaxError ? 'JSON inválido' : error.message }, { status, headers });
    }
  };
}
