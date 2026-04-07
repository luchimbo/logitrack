import { NextResponse } from 'next/server';
import { requireGlobalAdmin } from '@/lib/auth';
import { getZipnovaShipment, normalizeZipnovaShipment } from '@/lib/zipnovaClient';

export async function GET(request, { params }) {
  try {
    const authResult = await requireGlobalAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const { id } = await params;
    const shipment = await getZipnovaShipment(id);

    return NextResponse.json({
      shipment: normalizeZipnovaShipment(shipment),
      raw: shipment,
    });
  } catch (error) {
    console.error('Zipnova detail error:', error);
    return NextResponse.json({ error: error.message || 'Error al consultar detalle Zipnova' }, { status: 500 });
  }
}
