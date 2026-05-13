import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { listIntegrationConnections } from '@/lib/integrationService';

export async function GET(request) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) return NextResponse.json(authResult.error.body, { status: authResult.error.status });

    const connections = await listIntegrationConnections({ workspaceId: authResult.actor.workspaceId, provider: 'mercadolibre' });
    return NextResponse.json({
      connected: Boolean(connections.length),
      connectedAt: connections[0]?.connectedAt || null,
      connections,
    });
  } catch (error) {
    console.error('Mercado Libre status error:', error);
    return NextResponse.json({ error: error.message || 'Error al consultar Mercado Libre' }, { status: 500 });
  }
}
