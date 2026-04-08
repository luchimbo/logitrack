import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function DELETE(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }
    const actor = authResult.actor;
    const { ids } = await request.json();

    const normalizedIds = Array.isArray(ids)
      ? [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
      : [];

    if (!normalizedIds.length) {
      return NextResponse.json({ error: 'No hay envíos seleccionados' }, { status: 400 });
    }

    const placeholders = normalizedIds.map(() => '?').join(', ');
    const existing = await db.execute({
      sql: `SELECT id FROM shipments WHERE workspace_id = ? AND id IN (${placeholders})`,
      args: [actor.workspaceId, ...normalizedIds],
    });
    const existingIds = existing.rows.map((row) => Number(row.id));

    if (!existingIds.length) {
      return NextResponse.json({ success: true, deleted: 0 });
    }

    const deletePlaceholders = existingIds.map(() => '?').join(', ');
    await db.execute({
      sql: `DELETE FROM shipments WHERE workspace_id = ? AND id IN (${deletePlaceholders})`,
      args: [actor.workspaceId, ...existingIds],
    });

    await logAudit({
      workspaceId: actor.workspaceId,
      appUserId: actor.appUserId,
      actorType: actor.authType,
      actorLabel: actor.email || actor.username,
      action: 'bulk_delete_shipments',
      entityType: 'shipment',
      entityId: existingIds.join(','),
      metadata: { ids: existingIds, deleted: existingIds.length },
    });

    return NextResponse.json({ success: true, deleted: existingIds.length });
  } catch (error) {
    console.error('Bulk delete shipments error:', error);
    return NextResponse.json({ error: 'Error al eliminar envíos' }, { status: 500 });
  }
}
