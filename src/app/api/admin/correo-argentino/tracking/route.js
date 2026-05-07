import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { resolveCorreoArgentinoClient } from '@/lib/correoArgentinoResolver';
import { updateCorreoArgentinoTracking } from '@/lib/correoArgentinoStore';

export async function GET(request) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const { searchParams } = new URL(request.url);
    const tracking = String(searchParams.get('tracking') || searchParams.get('trackingNumber') || '').trim();
    if (!tracking) {
      return NextResponse.json({ error: 'Ingresá un número de tracking' }, { status: 400 });
    }

    const client = await resolveCorreoArgentinoClient(authResult.actor.workspaceId);
    const response = await client.getTracking(tracking, { extClient: searchParams.get('extClient') || '' });
    await updateCorreoArgentinoTracking({
      workspaceId: authResult.actor.workspaceId,
      trackingNumber: tracking,
      response,
    });
    return NextResponse.json({ response });
  } catch (error) {
    console.error('Correo Argentino tracking error:', error);
    return NextResponse.json({ error: error.message || 'Error al consultar tracking Correo Argentino' }, { status: 500 });
  }
}
