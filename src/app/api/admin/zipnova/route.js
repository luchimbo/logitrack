import { NextResponse } from 'next/server';
import { requireGlobalAdmin } from '@/lib/auth';
import { getZipnovaShipment, listZipnovaShipmentsByStatuses, normalizeZipnovaShipment } from '@/lib/zipnovaClient';

const PENDING_STATUSES = ['new'];
const READY_STATUSES = ['documentation_ready', 'ready_to_ship'];

async function enrichShipments(shipments) {
  return Promise.all(
    shipments.map(async (shipment) => {
      try {
        const detailed = await getZipnovaShipment(shipment.id);
        return normalizeZipnovaShipment(detailed);
      } catch {
        return normalizeZipnovaShipment(shipment);
      }
    })
  );
}

function filterShipments(shipments, externalId) {
  return shipments.filter((shipment) => {
    if (externalId && String(shipment.external_id || '').toLowerCase() !== String(externalId).toLowerCase()) {
      return false;
    }
    return true;
  });
}

export async function GET(request) {
  try {
    const authResult = await requireGlobalAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const { searchParams } = new URL(request.url);
    const externalId = searchParams.get('external_id') || '';

    const [pendingResults, readyResults] = await Promise.all([
      listZipnovaShipmentsByStatuses(PENDING_STATUSES, { page: 1, externalId }),
      listZipnovaShipmentsByStatuses(READY_STATUSES, { page: 1, externalId }),
    ]);

    const pendingBase = pendingResults.flatMap((entry) => entry.response?.data || []);
    const readyBase = readyResults.flatMap((entry) => entry.response?.data || []);

    const pendingToday = filterShipments(await enrichShipments(pendingBase), externalId);
    const readyToday = filterShipments(await enrichShipments(readyBase), externalId);

    return NextResponse.json({
      pendingShipments: pendingToday,
      readyShipments: readyToday,
    });
  } catch (error) {
    console.error('Zipnova list error:', error);
    return NextResponse.json({ error: error.message || 'Error al consultar Zipnova' }, { status: 500 });
  }
}
