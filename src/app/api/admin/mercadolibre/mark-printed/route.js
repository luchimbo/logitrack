import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { markMercadoLibreLabelsPrinted } from '@/lib/mercadolibreStore';

export async function POST(request) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) return NextResponse.json(authResult.error.body, { status: authResult.error.status });

    const body = await request.json().catch(() => ({}));
    const connectionId = String(body?.connectionId || '').trim();
    const orderIds = Array.isArray(body?.orderIds)
      ? body.orderIds
      : body?.orderId ? [body.orderId] : [];
    if (!connectionId || !orderIds.length) {
      return NextResponse.json({ error: 'connectionId y orderIds son obligatorios' }, { status: 400 });
    }

    const count = await markMercadoLibreLabelsPrinted({
      workspaceId: authResult.actor.workspaceId,
      connectionId,
      orderIds,
    });
    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error('Mercado Libre mark-printed error:', error);
    return NextResponse.json({ error: error.message || 'Error al marcar etiquetas impresas' }, { status: 500 });
  }
}
