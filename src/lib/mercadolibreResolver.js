import { createMercadoLibreClient } from '@/lib/mercadolibreClient';
import { getIntegrationConnection, listIntegrationConnections, markIntegrationConnectionAuthError, saveIntegrationConnection } from '@/lib/integrationService';
import { isMercadoLibreReauthError, refreshMercadoLibreToken } from '@/lib/mercadolibreOAuth';

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
    let tokens;
    try {
      tokens = await refreshMercadoLibreToken({ refreshToken: config.refreshToken });
    } catch (error) {
      if (isMercadoLibreReauthError(error)) {
        await markIntegrationConnectionAuthError({ id: connection.id, error: error.message }).catch(() => {});
        throw Object.assign(new Error(`La cuenta ${connection.displayName || connection.externalStoreId} necesita reconectarse en Canales`), { code: 'needs_reauth', cause: error });
      }
      throw error;
    }
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
    return client ? [{ connectionId: connection.id, externalStoreId: connection.externalStoreId, displayName: connection.displayName, config: connection.config, client }] : [];
  }

  const connections = await listIntegrationConnections({ workspaceId, provider: 'mercadolibre', includeConfig: true });
  const targets = [];
  for (const connection of connections) {
    // Una cuenta con el token vencido no debe dejar sin datos a las demás.
    let client = null;
    try {
      client = await clientFromConnection(connection);
    } catch (error) {
      console.error('Mercado Libre connection unavailable', { connectionId: connection.id, code: error?.code || '', error: error?.message || String(error) });
      continue;
    }
    if (client) targets.push({ connectionId: connection.id, externalStoreId: connection.externalStoreId, displayName: connection.displayName, config: connection.config, client });
  }
  return targets;
}
