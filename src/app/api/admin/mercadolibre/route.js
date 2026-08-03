import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { getMercadoLibreSyncMeta, listLiveMercadoLibrePrintableOrders, listStoredMercadoLibreOrders, syncMercadoLibreOrders } from '@/lib/mercadolibreStore';

// Las dos cuentas se consultan en paralelo, pero Mercado Libre puede demorar al
// responder muchos envíos. Dejamos margen suficiente para completar el resumen.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) return NextResponse.json(authResult.error.body, { status: authResult.error.status });

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const view = searchParams.get('view') || '';
    const syncMode = searchParams.get('sync') || '0';
    const connectionId = searchParams.get('connection_id') || '';
    const workspaceId = authResult.actor.workspaceId;
    let warning = '';
    let didSync = false;
    let syncedCount = 0;
    let liveOrders = null;

    if (syncMode === 'live') {
      try {
        const targets = await listMercadoLibreClientTargets(workspaceId, { connectionId });
        if (!targets.length) throw new Error('Mercado Libre no esta conectado para este workspace');
        const perAccount = await Promise.all(targets.map((target) => listLiveMercadoLibrePrintableOrders({
          client: target.client,
          externalStoreId: target.externalStoreId,
          maxPages: 5,
        })));
        liveOrders = perAccount.flat();
        didSync = true;
        syncedCount = liveOrders.length;
      } catch (error) {
        warning = error.message || 'No se pudo consultar Mercado Libre en vivo';
      }
    }

    if (syncMode === 'force' || syncMode === 'quick') {
      try {
        const targets = await listMercadoLibreClientTargets(workspaceId, { connectionId });
        if (!targets.length) throw new Error('Mercado Libre no esta conectado para este workspace');
        // Cada cuenta tiene su propio token. Sincronizarlas en serie hacía que
        // la segunda quedara fuera del límite de la petición cuando la primera
        // tenía muchas ventas recientes.
        const results = await Promise.allSettled(targets.map((target) => syncMercadoLibreOrders({
            workspaceId,
            client: target.client,
            connectionId: target.connectionId,
            externalStoreId: target.externalStoreId,
            siteId: target.config?.siteId || 'MLA',
            q: '',
            light: true,
            // El tablero sólo necesita detectar cambios recientes. Evitamos
            // recorrer todo el historial cuando se solicita una actualización rápida.
            maxPages: syncMode === 'quick' ? 1 : 5,
          })));
        const failures = [];
        for (let index = 0; index < results.length; index += 1) {
          const result = results[index];
          if (result.status === 'fulfilled') syncedCount += result.value;
          else failures.push(`${targets[index].externalStoreId}: ${result.reason?.message || 'error de sincronización'}`);
        }
        didSync = syncedCount > 0;
        if (failures.length) warning = `No se pudo actualizar una cuenta: ${failures.join(' · ')}`;
      } catch (error) {
        warning = error.message || 'No se pudo sincronizar Mercado Libre en vivo';
      }
    }

    const orders = await listStoredMercadoLibreOrders({ workspaceId, connectionId, q, view });
    const meta = await getMercadoLibreSyncMeta({ workspaceId, connectionId });
    return NextResponse.json({ orders, liveOrders, warning, didSync, syncedCount, totalOrders: meta.totalOrders || 0, lastSyncedAt: meta.lastSyncedAt || '' });
  } catch (error) {
    console.error('Mercado Libre list error:', error);
    return NextResponse.json({ error: error.message || 'Error al consultar Mercado Libre' }, { status: 500 });
  }
}
