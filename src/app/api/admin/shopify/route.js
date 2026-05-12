import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { listShopifyClientTargets } from '@/lib/shopifyResolver';
import { getShopifySyncMeta, listStoredShopifyOrders, syncShopifyOrders } from '@/lib/shopifyStore';

export async function GET(request) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const syncMode = searchParams.get('sync') || '0';
    const connectionId = searchParams.get('connection_id') || '';
    const workspaceId = authResult.actor.workspaceId;
    let warning = '';
    let didSync = false;

    if (syncMode === 'force') {
      try {
        const targets = await listShopifyClientTargets(workspaceId, { connectionId });
        if (!targets.length) throw new Error('Shopify no está conectado para este workspace');
        for (const target of targets) {
          await syncShopifyOrders({ workspaceId, client: target.client, connectionId: target.connectionId, externalStoreId: target.externalStoreId, q: '' });
        }
        didSync = true;
      } catch (error) {
        warning = error.message || 'No se pudo sincronizar Shopify en vivo';
      }
    }

    const orders = await listStoredShopifyOrders({ workspaceId, connectionId, q });
    const meta = await getShopifySyncMeta({ workspaceId, connectionId });
    return NextResponse.json({ orders, warning, didSync, lastSyncedAt: meta.lastSyncedAt || '' });
  } catch (error) {
    console.error('Shopify list error:', error);
    return NextResponse.json({ error: error.message || 'Error al consultar Shopify' }, { status: 500 });
  }
}
