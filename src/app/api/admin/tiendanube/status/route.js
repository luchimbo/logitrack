import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { getIntegrationMeta } from '@/lib/integrationService';

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

    const meta = await getIntegrationMeta({ workspaceId, provider: 'tiendanube' });
    return NextResponse.json({
      connected: Boolean(meta?.isActive),
      connectedAt: meta?.connectedAt || null,
    });
  } catch (error) {
    console.error('Tiendanube status error:', error);
    return NextResponse.json({ error: error.message || 'Error al consultar estado' }, { status: 500 });
  }
}
