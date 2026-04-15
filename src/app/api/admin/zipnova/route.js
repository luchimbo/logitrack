import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { listStoredZipnovaToday, syncZipnovaVisibleShipments } from '@/lib/zipnovaStore';
import { resolveZipnovaClient } from '@/lib/zipnovaResolver';

export async function GET(request) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const { searchParams } = new URL(request.url);
    const externalId = searchParams.get('external_id') || '';
    const shouldSync = searchParams.get('sync') !== '0';
    let warning = '';

    const client = await resolveZipnovaClient(authResult.actor.workspaceId);

    if (shouldSync) {
      try {
        await syncZipnovaVisibleShipments({ externalId, client });
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
