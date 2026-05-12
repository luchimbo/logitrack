import { createTiendanubeClient } from '@/lib/tiendanubeClient';
import { getIntegration, getIntegrationConnection, listIntegrationConnections } from '@/lib/integrationService';

function assertScopes(scopeValue, requiredScopes) {
  const scope = String(scopeValue || '').toLowerCase();
  if (!scope) return;
  const missingScopes = requiredScopes.filter((requiredScope) => !scope.includes(String(requiredScope || '').toLowerCase()));
  if (missingScopes.length) {
    throw new Error(`La integración de Tiendanube no tiene permiso ${missingScopes.join(', ')}. Reautorizá la app con los permisos necesarios.`);
  }
}

function clientFromConnection(connection, requiredScopes) {
  assertScopes(connection?.config?.scope, requiredScopes);
  if (connection?.config?.accessToken && connection?.config?.storeId) {
    return createTiendanubeClient({
      accessToken: connection.config.accessToken,
      storeId: connection.config.storeId,
    });
  }
  return null;
}

export async function resolveTiendanubeClient(workspaceId, { requiredScopes = ['read_orders'], connectionId = '' } = {}) {
  if (!workspaceId) {
    throw new Error('Workspace no especificado');
  }
  try {
    if (connectionId) {
      const connection = await getIntegrationConnection({ workspaceId, provider: 'tiendanube', id: connectionId, includeConfig: true });
      const client = clientFromConnection(connection, requiredScopes);
      if (client) return client;
    }

    const connections = await listIntegrationConnections({ workspaceId, provider: 'tiendanube', includeConfig: true });
    if (connections.length) {
      const client = clientFromConnection(connections[0], requiredScopes);
      if (client) return client;
    }

    const integration = await getIntegration({ workspaceId, provider: 'tiendanube' });
    assertScopes(integration?.config?.scope, requiredScopes);
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

export async function listTiendanubeClientTargets(workspaceId, { requiredScopes = ['read_orders'], connectionId = '' } = {}) {
  if (connectionId) {
    const connection = await getIntegrationConnection({ workspaceId, provider: 'tiendanube', id: connectionId, includeConfig: true });
    const client = clientFromConnection(connection, requiredScopes);
    return client ? [{ connectionId: connection.id, externalStoreId: connection.externalStoreId, client }] : [];
  }

  const connections = await listIntegrationConnections({ workspaceId, provider: 'tiendanube', includeConfig: true });
  if (connections.length) {
    return connections.map((connection) => ({
      connectionId: connection.id,
      externalStoreId: connection.externalStoreId,
      client: clientFromConnection(connection, requiredScopes),
    })).filter((item) => item.client);
  }

  const legacy = await getIntegration({ workspaceId, provider: 'tiendanube' });
  assertScopes(legacy?.config?.scope, requiredScopes);
  if (legacy?.config?.accessToken && legacy?.config?.storeId) {
    return [{
      connectionId: null,
      externalStoreId: legacy.config.storeId,
      client: createTiendanubeClient({ accessToken: legacy.config.accessToken, storeId: legacy.config.storeId }),
    }];
  }

  return [];
}
