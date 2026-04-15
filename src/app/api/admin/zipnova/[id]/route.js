import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { normalizeZipnovaShipment } from '@/lib/zipnovaClient';
import { resolveZipnovaClient } from '@/lib/zipnovaResolver';

export async function GET(request, { params }) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const { id } = await params;
    const client = await resolveZipnovaClient(authResult.actor.workspaceId);
    const shipment = await client.getShipment(id);

    return NextResponse.json({
      shipment: normalizeZipnovaShipment(shipment),
      raw: shipment,
    });
  } catch (error) {
    console.error('Zipnova detail error:', error);
    return NextResponse.json({ error: error.message || 'Error al consultar detalle Zipnova' }, { status: 500 });
  }
}
