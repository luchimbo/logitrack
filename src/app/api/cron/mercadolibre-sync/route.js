import { NextResponse } from 'next/server';
import { listAllActiveIntegrationConnections } from '@/lib/integrationService';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { syncMercadoLibreOrders } from '@/lib/mercadolibreStore';
import { closeDeliveredOrders, refreshOpenOrders } from '@/lib/mercadolibreRefresh';
import { db } from '@/lib/db';
import { createFinanceRepository } from '@/lib/financeRepository';
import { reconcileMercadoLibreFinance, recoverMercadoLibreNotifications } from '@/lib/financeReconciliation';

// El cron debe poder completar todas las cuentas aunque la API de ML esté lenta.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Leaves the end of the 300 s window for the finance snapshot rebuild.
const REFRESH_BUDGET_MS = 210_000;

export async function GET(request) {
  // Vercel Cron envía Authorization: Bearer ${CRON_SECRET} si la env está definida.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const started = Date.now();
  const results = [];
  let totalSynced = 0;

  try {
    const connections = await listAllActiveIntegrationConnections({ provider: 'mercadolibre' });
    const syncConnection = async (connection) => {
      try {
        const targets = await listMercadoLibreClientTargets(connection.workspaceId, { connectionId: connection.id });
        const target = targets[0];
        if (!target?.client) {
          return { connectionId: connection.id, ok: false, error: 'cliente no disponible' };
        }
        const count = await syncMercadoLibreOrders({
          workspaceId: connection.workspaceId,
          client: target.client,
          connectionId: target.connectionId,
          externalStoreId: target.externalStoreId,
          siteId: target.config?.siteId || 'MLA',
          q: '',
          light: true,
          maxPages: 5,
        });
        await recoverMercadoLibreNotifications(connection.workspaceId, target);
        const reconciliation = await reconcileMercadoLibreFinance(connection.workspaceId, target);
        // Closing is best effort: a failure here must not hide the sync that already succeeded.
        let upkeep = null;
        try {
          const closed = await closeDeliveredOrders(target.connectionId);
          upkeep = { closed, ...(await refreshOpenOrders(connection.workspaceId, target, { deadline: started + REFRESH_BUDGET_MS })) };
        } catch (error) { console.error('Cron ML upkeep error (connection', connection.id, '):', error.message || error); }
        return { connectionId: connection.id, ok: true, synced: count, reconciliation, upkeep };
      } catch (error) {
        console.error('Cron ML sync error (connection', connection.id, '):', error.message || error);
        return { connectionId: connection.id, ok: false, error: error.message || 'error' };
      }
    };
    const connectionResults = await Promise.all(connections.map(syncConnection));
    for (const result of connectionResults) {
      results.push(result);
      if (result.ok) totalSynced += result.synced;
    }

    // Refresh the precomputed finance map once the day's data is in.
    const repository = createFinanceRepository(db);
    for (const workspaceId of new Set(connections.map((connection) => connection.workspaceId))) {
      try { await repository.rebuildSnapshot(workspaceId); } catch (error) { console.error('Cron finance snapshot error (workspace', workspaceId, '):', error.message || error); }
    }

    return NextResponse.json({ ok: true, connections: connections.length, totalSynced, results });
  } catch (error) {
    console.error('Cron ML sync fatal error:', error);
    return NextResponse.json({ error: error.message || 'Cron sync failed' }, { status: 500 });
  }
}
