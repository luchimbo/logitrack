import { NextResponse } from 'next/server';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { deleteShipmentsByIds, normalizeShipmentIds } from '@/lib/shipmentDeletion';

export async function DELETE(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }
    const actor = authResult.actor;
    const { ids } = await request.json();

    const normalizedIds = normalizeShipmentIds(ids);

    if (!normalizedIds.length) {
      return NextResponse.json({ error: 'No hay envíos seleccionados' }, { status: 400 });
    }

    const result = await deleteShipmentsByIds({ workspaceId: actor.workspaceId, ids: normalizedIds });

    if (!result.deleted) {
      return NextResponse.json({ success: true, deleted: 0 });
    }

    await logAudit({
      workspaceId: actor.workspaceId,
      appUserId: actor.appUserId,
      actorType: actor.authType,
      actorLabel: actor.email || actor.username,
      action: 'bulk_delete_shipments',
      entityType: 'shipment',
      entityId: result.ids.join(','),
      metadata: { ids: result.ids, deleted: result.deleted },
    });

    return NextResponse.json({ success: true, deleted: result.deleted, ids: result.ids });
  } catch (error) {
    console.error('Bulk delete shipments error:', error);
    return NextResponse.json({ error: 'Error al eliminar envíos' }, { status: 500 });
  }
}
