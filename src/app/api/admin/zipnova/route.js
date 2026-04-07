import { NextResponse } from 'next/server';
import { requireGlobalAdmin } from '@/lib/auth';
import { listZipnovaShipments, normalizeZipnovaShipment } from '@/lib/zipnovaClient';

export async function GET(request) {
  try {
    const authResult = await requireGlobalAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page') || 1);
    const status = searchParams.get('status') || '';
    const serviceType = searchParams.get('service_type') || '';
    const orderId = searchParams.get('order_id') || '';
    const externalId = searchParams.get('external_id') || '';

    const result = await listZipnovaShipments({ page, status, serviceType, orderId, externalId });

    return NextResponse.json({
      shipments: Array.isArray(result?.data) ? result.data.map(normalizeZipnovaShipment) : [],
      meta: result?.meta || null,
      links: result?.links || null,
    });
  } catch (error) {
    console.error('Zipnova list error:', error);
    return NextResponse.json({ error: error.message || 'Error al consultar Zipnova' }, { status: 500 });
  }
}
