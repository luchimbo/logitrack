import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { getIntegrationMeta, listIntegrationConnections } from '@/lib/integrationService';

export async function GET(request) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const workspaceId = authResult.actor.workspaceId;
    if (!workspaceId) {
      return NextResponse.json({ connected: false });
    }

    const connections = await listIntegrationConnections({ workspaceId, provider: 'tiendanube' });
    const meta = await getIntegrationMeta({ workspaceId, provider: 'tiendanube' });
    const legacyConnection = meta?.isActive && !connections.length ? [{
      id: 'legacy-tiendanube',
      provider: 'tiendanube',
      externalStoreId: 'legacy',
      displayName: 'Tienda conectada',
      connectedAt: meta.connectedAt || null,
      legacy: true,
    }] : [];
    const allConnections = [...connections, ...legacyConnection];
    return NextResponse.json({
      connected: Boolean(allConnections.length || meta?.isActive),
      connectedAt: allConnections[0]?.connectedAt || meta?.connectedAt || null,
      connections: allConnections,
    });
  } catch (error) {
    console.error('Tiendanube status error:', error);
    return NextResponse.json({ error: error.message || 'Error al consultar estado' }, { status: 500 });
  }
}
