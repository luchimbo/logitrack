import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { resolveCorreoArgentinoClient } from '@/lib/correoArgentinoResolver';
import { listCorreoArgentinoShipments, saveCorreoArgentinoShipment } from '@/lib/correoArgentinoStore';

export async function GET(request) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const { searchParams } = new URL(request.url);
    const shipments = await listCorreoArgentinoShipments({
      workspaceId: authResult.actor.workspaceId,
      limit: Number(searchParams.get('limit') || 50),
    });
    return NextResponse.json({ shipments });
  } catch (error) {
    console.error('Correo Argentino shipments list error:', error);
    return NextResponse.json({ error: error.message || 'Error al listar envíos Correo Argentino' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const payload = await request.json().catch(() => ({}));
    const client = await resolveCorreoArgentinoClient(authResult.actor.workspaceId);
    const response = await client.createOrder(payload);
    const localId = await saveCorreoArgentinoShipment({
      workspaceId: authResult.actor.workspaceId,
      payload,
      response,
    });
    return NextResponse.json({ response, localId });
  } catch (error) {
    console.error('Correo Argentino shipment import error:', error);
    return NextResponse.json({ error: error.message || 'Error al crear envío Correo Argentino' }, { status: 500 });
  }
}
