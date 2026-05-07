import { createCorreoArgentinoClient, getDefaultCorreoArgentinoClient } from '@/lib/correoArgentinoClient';
import { getIntegration } from '@/lib/integrationService';

export async function resolveCorreoArgentinoClient(workspaceId) {
  if (!workspaceId) return getDefaultCorreoArgentinoClient();

  try {
    const integration = await getIntegration({ workspaceId, provider: 'correo_argentino' });
    if (integration?.config) {
      return createCorreoArgentinoClient(integration.config);
    }
  } catch (error) {
    console.error('Error resolving Correo Argentino client for workspace', workspaceId, error.message || error);
  }

  return getDefaultCorreoArgentinoClient();
}
