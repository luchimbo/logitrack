import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { markMercadoLibreLabelsPrinted } from '@/lib/mercadolibreStore';
import { logAudit } from '@/lib/audit';

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
    const { actor } = authResult;
    await logAudit({
      workspaceId: actor.workspaceId,
      appUserId: actor.appUserId,
      actorType: actor.authType,
      actorLabel: actor.email || actor.username,
      action: 'mark_ml_labels_printed',
      entityType: 'mercadolibre_order',
      entityId: orderIds.slice(0, 50).join(','),
      metadata: { connectionId, orders: orderIds.length, count },
    });
    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error('Mercado Libre mark-printed error:', error);
    return NextResponse.json({ error: error.message || 'Error al marcar etiquetas impresas' }, { status: 500 });
  }
}
