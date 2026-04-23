import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { updateTiendanubeDispatchStatus } from '@/lib/tiendanubeStore';

function normalizeDispatchStatus(value) {
  return String(value || '').toLowerCase() === 'dispatched' ? 'dispatched' : 'to_send';
}

function getActorLabel(actor) {
  return actor?.email || actor?.username || actor?.id || 'usuario';
}

export async function POST(request) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    const normalizedIds = [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)))];

    if (!normalizedIds.length) {
      return NextResponse.json({ error: 'Debes seleccionar al menos un pedido' }, { status: 400 });
    }

    const dispatchStatus = normalizeDispatchStatus(body?.status);
    const actor = authResult.actor;
    const result = await updateTiendanubeDispatchStatus({
      workspaceId: actor.workspaceId,
      ids: normalizedIds,
      dispatchStatus,
      actorLabel: getActorLabel(actor),
    });

    await logAudit({
      workspaceId: actor.workspaceId,
      appUserId: actor.appUserId,
      actorType: actor.authType || 'workspace-user',
      actorLabel: getActorLabel(actor),
      action: dispatchStatus === 'dispatched' ? 'tiendanube_dispatch_marked' : 'tiendanube_dispatch_reset',
      entityType: 'tiendanube_order',
      metadata: {
        ids: normalizedIds,
        updated: result.updated,
        dispatchStatus,
      },
    });

    return NextResponse.json({
      updated: result.updated,
      status: dispatchStatus,
    });
  } catch (error) {
    console.error('Tiendanube dispatch status error:', error);
    return NextResponse.json({ error: error.message || 'No se pudo actualizar el estado de despacho' }, { status: 500 });
  }
}
