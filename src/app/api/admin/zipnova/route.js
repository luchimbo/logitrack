import { NextResponse } from 'next/server';
import { requireGlobalAdmin } from '@/lib/auth';
import { getZipnovaShipment, listZipnovaShipments, normalizeZipnovaShipment } from '@/lib/zipnovaClient';

export async function GET(request) {
  try {
    const authResult = await requireGlobalAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page') || 1);
    const status = searchParams.get('status') || 'new';
    const serviceType = searchParams.get('service_type') || '';
    const orderId = searchParams.get('order_id') || '';
    const externalId = searchParams.get('external_id') || '';

    const result = await listZipnovaShipments({ page, status, serviceType, orderId, externalId });

    const baseShipments = Array.isArray(result?.data) ? result.data : [];
    const enriched = await Promise.all(
      baseShipments.map(async (shipment) => {
        try {
          const detailed = await getZipnovaShipment(shipment.id);
          return normalizeZipnovaShipment(detailed);
        } catch {
          return normalizeZipnovaShipment(shipment);
        }
      })
    );

    return NextResponse.json({
      shipments: enriched,
      meta: result?.meta || null,
      links: result?.links || null,
    });
  } catch (error) {
    console.error('Zipnova list error:', error);
    return NextResponse.json({ error: error.message || 'Error al consultar Zipnova' }, { status: 500 });
  }
}
