import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { listTiendanubeClientTargets } from '@/lib/tiendanubeResolver';
import { getTiendanubeSyncMeta, listStoredTiendanubeOrders, syncTiendanubeOrders } from '@/lib/tiendanubeStore';

export async function GET(request) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';
    const paymentStatus = searchParams.get('payment_status') || '';
    const q = searchParams.get('q') || '';
    const syncMode = searchParams.get('sync') || '0';
    const connectionId = searchParams.get('connection_id') || '';
    let warning = '';
    let didSync = false;

    const workspaceId = authResult.actor.workspaceId;
    if (syncMode === 'force') {
      try {
        const targets = await listTiendanubeClientTargets(workspaceId, { connectionId });
        if (!targets.length) throw new Error('Tiendanube no está conectado para este workspace');
        for (const target of targets) {
          await syncTiendanubeOrders({
            workspaceId,
            client: target.client,
            status,
            paymentStatus,
            q: '',
            connectionId: target.connectionId,
            externalStoreId: target.externalStoreId,
          });
        }
        didSync = true;
      } catch (error) {
        warning = error.message || 'No se pudo sincronizar Tiendanube en vivo';
      }
    }

    const orders = await listStoredTiendanubeOrders({ workspaceId, status, paymentStatus, q, connectionId });
    const updatedSyncMeta = await getTiendanubeSyncMeta({ workspaceId, connectionId });
    return NextResponse.json({
      orders,
      warning,
      didSync,
      lastSyncedAt: updatedSyncMeta.lastSyncedAt || '',
    });
  } catch (error) {
    console.error('Tiendanube list error:', error);
    return NextResponse.json({ error: error.message || 'Error al consultar Tiendanube' }, { status: 500 });
  }
}
