import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { resolveTiendanubeClient } from '@/lib/tiendanubeResolver';
import { getStoredTiendanubeOrder, upsertTiendanubeOrder } from '@/lib/tiendanubeStore';

function normalizeTargetStatus(value) {
  return String(value || '').toLowerCase() === 'dispatched' ? 'dispatched' : 'to_send';
}

function mapTargetToFulfillmentStatus(status) {
  return status === 'dispatched' ? 'DISPATCHED' : 'UNPACKED';
}

function getActorLabel(actor) {
  return actor?.email || actor?.username || actor?.id || 'usuario';
}

async function updateOrderInTiendanube({ client, workspaceId, orderId, targetStatus }) {
  const fulfillmentTarget = mapTargetToFulfillmentStatus(targetStatus);
  const fulfillmentOrders = await client.listFulfillmentOrders(orderId);

  if (!fulfillmentOrders.length) {
    throw new Error(`El pedido ${orderId} no tiene fulfillment orders editables en Tiendanube`);
  }

  for (const fulfillmentOrder of fulfillmentOrders) {
    const fulfillmentId = fulfillmentOrder?.id;
    if (!fulfillmentId) continue;

    const currentStatus = String(fulfillmentOrder?.status || '').toUpperCase();
    if (currentStatus === fulfillmentTarget) continue;

    await client.updateFulfillmentOrderStatus(orderId, fulfillmentId, fulfillmentTarget);
  }

  const refreshedOrder = await client.getOrder(orderId);
  await upsertTiendanubeOrder(workspaceId, refreshedOrder);
  return getStoredTiendanubeOrder({ workspaceId, id: orderId });
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

    const targetStatus = normalizeTargetStatus(body?.status);
    const actor = authResult.actor;
    const client = await resolveTiendanubeClient(actor.workspaceId, {
      requiredScopes: ['read_orders', 'write_fulfillment_orders'],
    });

    const updatedOrders = [];
    const failures = [];

    for (const orderId of normalizedIds) {
      try {
        const updatedOrder = await updateOrderInTiendanube({
          client,
          workspaceId: actor.workspaceId,
          orderId,
          targetStatus,
        });
        if (updatedOrder) {
          updatedOrders.push(updatedOrder);
        }
      } catch (error) {
        failures.push({
          id: orderId,
          error: error.message || 'No se pudo actualizar el pedido en Tiendanube',
        });
      }
    }

    await logAudit({
      workspaceId: actor.workspaceId,
      appUserId: actor.appUserId,
      actorType: actor.authType || 'workspace-user',
      actorLabel: getActorLabel(actor),
      action: targetStatus === 'dispatched' ? 'tiendanube_shipping_marked_dispatched' : 'tiendanube_shipping_marked_to_send',
      entityType: 'tiendanube_order',
      metadata: {
        ids: normalizedIds,
        updated: updatedOrders.length,
        failed: failures.length,
        targetStatus,
      },
    });

    return NextResponse.json({
      updated: updatedOrders.length,
      failed: failures.length,
      status: targetStatus,
      orders: updatedOrders,
      failures,
    });
  } catch (error) {
    console.error('Tiendanube dispatch status error:', error);
    return NextResponse.json({ error: error.message || 'No se pudo actualizar el estado de despacho' }, { status: 500 });
  }
}
