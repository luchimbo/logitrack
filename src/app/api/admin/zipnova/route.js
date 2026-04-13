import { NextResponse } from 'next/server';
import { requireGlobalAdmin } from '@/lib/auth';
import { listStoredZipnovaToday, syncZipnovaVisibleShipments } from '@/lib/zipnovaStore';

export async function GET(request) {
  try {
    const authResult = await requireGlobalAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const { searchParams } = new URL(request.url);
    const externalId = searchParams.get('external_id') || '';
    const shouldSync = searchParams.get('sync') !== '0';
    let warning = '';

    if (shouldSync) {
      try {
        await syncZipnovaVisibleShipments({ externalId });
      } catch (error) {
        warning = error.message || 'No se pudo sincronizar Zipnova en vivo';
      }
    }

    const response = await listStoredZipnovaToday({ externalId });
    return NextResponse.json({ ...response, warning });
  } catch (error) {
    console.error('Zipnova list error:', error);
    return NextResponse.json({ error: error.message || 'Error al consultar Zipnova' }, { status: 500 });
  }
}
