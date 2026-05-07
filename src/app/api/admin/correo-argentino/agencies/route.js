import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { resolveCorreoArgentinoClient } from '@/lib/correoArgentinoResolver';

export async function GET(request) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const client = await resolveCorreoArgentinoClient(authResult.actor.workspaceId);
    const response = await client.listAgencies(params);
    return NextResponse.json({ response });
  } catch (error) {
    console.error('Correo Argentino agencies error:', error);
    return NextResponse.json({ error: error.message || 'Error al consultar agencias' }, { status: 500 });
  }
}
