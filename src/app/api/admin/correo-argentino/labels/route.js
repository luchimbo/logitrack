import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { resolveCorreoArgentinoClient } from '@/lib/correoArgentinoResolver';

export async function POST(request) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const body = await request.json().catch(() => ({}));
    const orders = Array.isArray(body?.orders) ? body.orders : [];
    const labelFormat = String(body?.labelFormat || '10x15').trim() || '10x15';
    if (!orders.length) {
      return NextResponse.json({ error: 'Ingresá al menos un tracking para obtener rótulo' }, { status: 400 });
    }

    const client = await resolveCorreoArgentinoClient(authResult.actor.workspaceId);
    const response = await client.getLabels(orders, { labelFormat });
    return NextResponse.json({ response });
  } catch (error) {
    console.error('Correo Argentino labels error:', error);
    return NextResponse.json({ error: error.message || 'Error al obtener rótulos Correo Argentino' }, { status: 500 });
  }
}
