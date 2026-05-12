import { createShopifyClient } from '@/lib/shopifyClient';
import { getIntegrationConnection, listIntegrationConnections } from '@/lib/integrationService';

function assertScopes(scopeValue, requiredScopes) {
  const scope = String(scopeValue || '').toLowerCase();
  if (!scope) return;
  const missingScopes = requiredScopes.filter((requiredScope) => !scope.includes(String(requiredScope || '').toLowerCase()));
  if (missingScopes.length) {
    throw new Error(`La integración de Shopify no tiene permiso ${missingScopes.join(', ')}. Reautorizá la app.`);
  }
}

function clientFromConnection(connection, requiredScopes) {
  assertScopes(connection?.config?.scope, requiredScopes);
  if (connection?.config?.accessToken && connection?.config?.shop) {
    return createShopifyClient({ shop: connection.config.shop, accessToken: connection.config.accessToken });
  }
  return null;
}

export async function listShopifyClientTargets(workspaceId, { connectionId = '', requiredScopes = ['read_orders'] } = {}) {
  if (connectionId) {
    const connection = await getIntegrationConnection({ workspaceId, provider: 'shopify', id: connectionId, includeConfig: true });
    const client = clientFromConnection(connection, requiredScopes);
    return client ? [{ connectionId: connection.id, externalStoreId: connection.externalStoreId, client }] : [];
  }

  const connections = await listIntegrationConnections({ workspaceId, provider: 'shopify', includeConfig: true });
  return connections.map((connection) => ({
    connectionId: connection.id,
    externalStoreId: connection.externalStoreId,
    client: clientFromConnection(connection, requiredScopes),
  })).filter((item) => item.client);
}
