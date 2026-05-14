import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { getMercadoLibreSyncMeta, listStoredMercadoLibreOrders, syncMercadoLibreOrders } from '@/lib/mercadolibreStore';

export async function GET(request) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) return NextResponse.json(authResult.error.body, { status: authResult.error.status });

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const view = searchParams.get('view') || '';
    const syncMode = searchParams.get('sync') || '0';
    const connectionId = searchParams.get('connection_id') || '';
    const workspaceId = authResult.actor.workspaceId;
    let warning = '';
    let didSync = false;
    let syncedCount = 0;

    if (syncMode === 'force') {
      try {
        const targets = await listMercadoLibreClientTargets(workspaceId, { connectionId });
        if (!targets.length) throw new Error('Mercado Libre no esta conectado para este workspace');
        for (const target of targets) {
          syncedCount += await syncMercadoLibreOrders({
            workspaceId,
            client: target.client,
            connectionId: target.connectionId,
            externalStoreId: target.externalStoreId,
            siteId: target.config?.siteId || 'MLA',
            q: '',
          });
        }
        didSync = true;
      } catch (error) {
        warning = error.message || 'No se pudo sincronizar Mercado Libre en vivo';
      }
    }

    const orders = await listStoredMercadoLibreOrders({ workspaceId, connectionId, q, view });
    const meta = await getMercadoLibreSyncMeta({ workspaceId, connectionId });
    return NextResponse.json({ orders, warning, didSync, syncedCount, totalOrders: meta.totalOrders || 0, lastSyncedAt: meta.lastSyncedAt || '' });
  } catch (error) {
    console.error('Mercado Libre list error:', error);
    return NextResponse.json({ error: error.message || 'Error al consultar Mercado Libre' }, { status: 500 });
  }
}
