import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { getStoredTiendanubeOrder } from '@/lib/tiendanubeStore';

export async function GET(request, { params }) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const { id } = await params;
    const workspaceId = authResult.actor.workspaceId;
    const order = await getStoredTiendanubeOrder({ workspaceId, id: Number(id) });

    if (!order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error('Tiendanube detail error:', error);
    return NextResponse.json({ error: error.message || 'Error al consultar detalle Tiendanube' }, { status: 500 });
  }
}
