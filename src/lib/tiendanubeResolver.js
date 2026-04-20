import { createTiendanubeClient } from '@/lib/tiendanubeClient';
import { getIntegration } from '@/lib/integrationService';

export async function resolveTiendanubeClient(workspaceId) {
  if (!workspaceId) {
    throw new Error('Workspace no especificado');
  }
  try {
    const integration = await getIntegration({ workspaceId, provider: 'tiendanube' });
    const scope = String(integration?.config?.scope || '').toLowerCase();

    if (scope && !scope.includes('read_orders')) {
      throw new Error('La integración de Tiendanube no tiene permiso read_orders. Reautorizá la app con permisos de Orders (lectura).');
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
