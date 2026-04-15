import { createZipnovaClient, getDefaultZipnovaClient } from '@/lib/zipnovaClient';
import { getIntegration } from '@/lib/integrationService';

export async function resolveZipnovaClient(workspaceId) {
  if (!workspaceId) {
    return getDefaultZipnovaClient();
  }
  try {
    const integration = await getIntegration({ workspaceId, provider: 'zipnova' });
    if (integration?.config?.accessToken) {
      return createZipnovaClient({
        accessToken: integration.config.accessToken,
        baseUrl: integration.config.baseUrl,
      });
    }
    if (integration?.config?.token && integration?.config?.secret) {
      return createZipnovaClient({
        token: integration.config.token,
        secret: integration.config.secret,
        baseUrl: integration.config.baseUrl,
      });
    }
  } catch (e) {
    console.error('Error resolving Zipnova client for workspace', workspaceId, e.message || e);
  }
  return getDefaultZipnovaClient();
}
