import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { listTiendanubeClientTargets } from '@/lib/tiendanubeResolver';
import { getTiendanubeSyncMeta, listStoredTiendanubeOrders, syncTiendanubeOrders } from '@/lib/tiendanubeStore';

const LIST_LIMIT = 500;

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
        const capped = [];
        for (const target of targets) {
          const stats = {};
          await syncTiendanubeOrders({
            stats,
            workspaceId,
            client: target.client,
            status,
            paymentStatus,
            q: '',
            connectionId: target.connectionId,
            externalStoreId: target.externalStoreId,
          });
          if (stats.capped) capped.push(target.externalStoreId);
        }
        didSync = true;
        if (capped.length) warning = 'Se actualizaron los 500 pedidos más recientes; el resto lo completa la sincronización automática.';
      } catch (error) {
        warning = error.message || 'No se pudo sincronizar Tiendanube en vivo';
      }
    }

    const orders = await listStoredTiendanubeOrders({ workspaceId, status, paymentStatus, q, connectionId, limit: LIST_LIMIT });
    if (orders.length >= LIST_LIMIT && !warning) warning = `Se muestran los ${LIST_LIMIT} pedidos más recientes. Usá la búsqueda para encontrar otros.`;
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
