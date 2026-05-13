import { createMercadoLibreClient } from '@/lib/mercadolibreClient';
import { getIntegrationConnection, listIntegrationConnections, saveIntegrationConnection } from '@/lib/integrationService';
import { refreshMercadoLibreToken } from '@/lib/mercadolibreOAuth';

function shouldRefresh(config = {}) {
  if (!config.refreshToken) return false;
  const expiresAt = new Date(config.expiresAt || 0).getTime();
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt - Date.now() < 5 * 60 * 1000;
}

async function clientFromConnection(connection) {
  if (!connection?.config?.accessToken) return null;
  let config = connection.config;

  if (shouldRefresh(config)) {
    const tokens = await refreshMercadoLibreToken({ refreshToken: config.refreshToken });
    config = { ...config, ...tokens };
    await saveIntegrationConnection({
      workspaceId: connection.workspaceId,
      provider: 'mercadolibre',
      externalStoreId: connection.externalStoreId,
      displayName: connection.displayName,
      config,
    });
  }

  return createMercadoLibreClient({ accessToken: config.accessToken });
}

export async function listMercadoLibreClientTargets(workspaceId, { connectionId = '' } = {}) {
  if (connectionId) {
    const connection = await getIntegrationConnection({ workspaceId, provider: 'mercadolibre', id: connectionId, includeConfig: true });
    const client = await clientFromConnection(connection);
    return client ? [{ connectionId: connection.id, externalStoreId: connection.externalStoreId, config: connection.config, client }] : [];
  }

  const connections = await listIntegrationConnections({ workspaceId, provider: 'mercadolibre', includeConfig: true });
  const targets = [];
  for (const connection of connections) {
    const client = await clientFromConnection(connection);
    if (client) targets.push({ connectionId: connection.id, externalStoreId: connection.externalStoreId, config: connection.config, client });
  }
  return targets;
}
