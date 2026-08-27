import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { deleteShipmentsByIds, normalizeShipmentIds } from '@/lib/shipmentDeletion';

export async function PATCH(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const actor = authResult.actor;
    const { ids, assigned_carrier: assignedCarrier } = await request.json();
    const normalizedIds = normalizeShipmentIds(ids);
    const carrierName = String(assignedCarrier || '').trim();

    if (!normalizedIds.length) {
      return NextResponse.json({ error: 'Seleccioná al menos un paquete' }, { status: 400 });
    }
    if (!carrierName) {
      return NextResponse.json({ error: 'Seleccioná el transportista de destino' }, { status: 400 });
    }

    const carrierResult = await db.execute({
      sql: 'SELECT display_name FROM carriers WHERE workspace_id = ? AND name = ? LIMIT 1',
      args: [actor.workspaceId, carrierName],
    });
    if (!carrierResult.rows.length) {
      return NextResponse.json({ error: 'El transportista de destino ya no está disponible' }, { status: 400 });
    }

    const placeholders = normalizedIds.map(() => '?').join(',');
    const updateResult = await db.execute({
      sql: `UPDATE shipments
            SET assigned_carrier = ?
            WHERE workspace_id = ? AND id IN (${placeholders})`,
      args: [carrierName, actor.workspaceId, ...normalizedIds],
    });
    const updated = Number(updateResult.rowsAffected || 0);

    await logAudit({
      workspaceId: actor.workspaceId,
      appUserId: actor.appUserId,
      actorType: actor.authType,
      actorLabel: actor.email || actor.username,
      action: 'bulk_reassign_shipments',
      entityType: 'shipment',
      entityId: normalizedIds.join(','),
      metadata: { ids: normalizedIds, assigned_carrier: carrierName, updated },
    });

    return NextResponse.json({
      success: true,
      updated,
      ids: normalizedIds,
      assigned_carrier: carrierName,
      carrier_display_name: carrierResult.rows[0].display_name || carrierName,
    });
  } catch (error) {
    console.error('Bulk reassign shipments error:', error);
    return NextResponse.json({ error: 'No se pudieron mover los paquetes. Intentá de nuevo.' }, { status: 500 });
  }
}

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
