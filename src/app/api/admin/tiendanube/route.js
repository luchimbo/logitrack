import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { resolveTiendanubeClient } from '@/lib/tiendanubeResolver';
import { listStoredTiendanubeOrders, syncTiendanubeOrders } from '@/lib/tiendanubeStore';

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
    const shouldSync = searchParams.get('sync') !== '0';
    let warning = '';

    const workspaceId = authResult.actor.workspaceId;

    if (shouldSync) {
      try {
        const client = await resolveTiendanubeClient(workspaceId);
        await syncTiendanubeOrders({ workspaceId, client, status, paymentStatus, q });
      } catch (error) {
        warning = error.message || 'No se pudo sincronizar Tiendanube en vivo';
      }
    }

    const orders = await listStoredTiendanubeOrders({ workspaceId, status, paymentStatus, q });
    return NextResponse.json({ orders, warning });
  } catch (error) {
    console.error('Tiendanube list error:', error);
    return NextResponse.json({ error: error.message || 'Error al consultar Tiendanube' }, { status: 500 });
  }
}
