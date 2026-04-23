import { createTiendanubeClient } from '@/lib/tiendanubeClient';
import { getIntegration } from '@/lib/integrationService';

export async function resolveTiendanubeClient(workspaceId, { requiredScopes = ['read_orders'] } = {}) {
  if (!workspaceId) {
    throw new Error('Workspace no especificado');
  }
  try {
    const integration = await getIntegration({ workspaceId, provider: 'tiendanube' });
    const scope = String(integration?.config?.scope || '').toLowerCase();

     if (scope) {
      const missingScopes = requiredScopes.filter((requiredScope) => !scope.includes(String(requiredScope || '').toLowerCase()));
      if (missingScopes.length) {
        throw new Error(`La integración de Tiendanube no tiene permiso ${missingScopes.join(', ')}. Reautorizá la app con los permisos necesarios.`);
      }
    }


    if (integration?.config?.accessToken && integration?.config?.storeId) {
      return createTiendanubeClient({
        accessToken: integration.config.accessToken,
        storeId: integration.config.storeId,
      });
    }
  } catch (e) {
    console.error('Error resolving Tiendanube client for workspace', workspaceId, e.message || e);
  }
  throw new Error('Tiendanube no está conectado para este workspace');
}
