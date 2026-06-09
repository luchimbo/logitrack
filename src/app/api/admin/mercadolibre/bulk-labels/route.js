import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { importMercadoLibreLabels, listStoredMercadoLibreOrders } from '@/lib/mercadolibreStore';
import { enqueuePrintQueue } from '@/lib/printQueue';

const VALID_ACTIONS = new Set(['import', 'print', 'import_and_print']);

function normalizeOrderIds(orderIds) {
  return Array.isArray(orderIds)
    ? [...new Set(orderIds.map((id) => String(id || '').trim()).filter(Boolean))]
    : [];
}

function skip(order, reason) {
  return {
    orderId: order?.id || '',
    shipmentId: order?.shipmentId || '',
    reason,
    status: order?.shipmentStatus || '',
    substatus: order?.shipmentSubstatus || '',
  };
}

async function loadSelectedOrders({ workspaceId, targets, orderIds, view }) {
  const selected = [];
  const orderIdSet = new Set(orderIds);
  for (const target of targets) {
    const orders = await listStoredMercadoLibreOrders({
      workspaceId,
      connectionId: target.connectionId,
      view: orderIdSet.size ? '' : view,
      limit: 500,
    });
    selected.push(...(orderIdSet.size ? orders.filter((order) => orderIdSet.has(String(order.id))) : orders));
  }
  return selected;
}

export async function POST(request) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) return NextResponse.json(authResult.error.body, { status: authResult.error.status });

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '').trim();
    if (!VALID_ACTIONS.has(action)) {
      return NextResponse.json({ error: 'Accion Mercado Libre invalida' }, { status: 400 });
    }

    const workspaceId = authResult.actor.workspaceId;
    const actorId = authResult.actor.id || null;
    const connectionId = String(body?.connectionId || '').trim();
    const view = String(body?.view || '').trim();
    const orderIds = normalizeOrderIds(body?.orderIds);

    const targets = await listMercadoLibreClientTargets(workspaceId, { connectionId });
    if (!targets.length) throw new Error('Mercado Libre no esta conectado para este workspace');

    const orders = await loadSelectedOrders({ workspaceId, targets, orderIds, view });
    if (!orders.length) {
      return NextResponse.json({ importedCount: 0, queuedCount: 0, shipmentRowIds: [], skipped: [] });
    }

    const targetByConnection = new Map(targets.map((target) => [String(target.connectionId), target]));
    const skipped = [];
    const importedResults = [];
    const existingShipmentRowIds = orders
      .filter((order) => order.shipmentRowId)
      .map((order) => Number(order.shipmentRowId))
      .filter(Boolean);

    if (action === 'import' || action === 'import_and_print') {
      const byConnection = new Map();
      for (const order of orders) {
        if (order.shipmentRowId) continue;
        const key = String(order.connectionId || '');
        if (!byConnection.has(key)) byConnection.set(key, []);
        byConnection.get(key).push(order);
      }

      for (const [key, list] of byConnection.entries()) {
        const target = targetByConnection.get(key);
        if (!target) {
          skipped.push(...list.map((order) => skip(order, 'Cuenta Mercado Libre no disponible')));
          continue;
        }
        const result = await importMercadoLibreLabels({
          workspaceId,
          client: target.client,
          orders: list,
          connectionId: target.connectionId,
        });
        importedResults.push(...result.imported);
        skipped.push(...result.skipped);
      }
    }

    let queueJobId = null;
    let queuedCount = 0;
    const importedShipmentRowIds = importedResults.map((item) => Number(item.shipmentRowId)).filter(Boolean);
    const shipmentRowIds = [...new Set([
      ...(action === 'print' ? existingShipmentRowIds : []),
      ...(action === 'import' ? importedShipmentRowIds : []),
      ...(action === 'import_and_print' ? [...existingShipmentRowIds, ...importedShipmentRowIds] : []),
    ])];

    if (action === 'print') {
      const missing = orders.filter((order) => !order.shipmentRowId);
      skipped.push(...missing.map((order) => skip(order, 'Etiqueta no importada a la operacion')));
    }

    if ((action === 'print' || action === 'import_and_print') && shipmentRowIds.length) {
      const queued = await enqueuePrintQueue({ workspaceId, actorId, shipmentIds: shipmentRowIds });
      queueJobId = queued.queue_job_id;
      queuedCount = queued.labels_total;
    }

    return NextResponse.json({
      importedCount: importedResults.length,
      queuedCount,
      queueJobId,
      shipmentRowIds,
      skipped,
    });
  } catch (error) {
    console.error('Mercado Libre bulk labels error:', error);
    return NextResponse.json({ error: error.message || 'Error en etiquetas Mercado Libre' }, { status: error.status || 500 });
  }
}
