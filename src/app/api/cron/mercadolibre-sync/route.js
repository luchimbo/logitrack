import { NextResponse } from 'next/server';
import { listAllActiveIntegrationConnections } from '@/lib/integrationService';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { syncMercadoLibreOrders } from '@/lib/mercadolibreStore';
import { db } from '@/lib/db';
import { createFinanceRepository } from '@/lib/financeRepository';
import { reconcileMercadoLibreFinance, recoverMercadoLibreNotifications } from '@/lib/financeReconciliation';

// El cron debe poder completar todas las cuentas aunque la API de ML esté lenta.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(request) {
  // Vercel Cron envía Authorization: Bearer ${CRON_SECRET} si la env está definida.
  const secret = process.env.CRON_SECRET;
  if (!secret || (request.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = [];
  let totalSynced = 0;

  try {
    const connections = await listAllActiveIntegrationConnections({ provider: 'mercadolibre' });
    const syncConnection = async (connection) => {
      const started = Date.now();
      let phase = 'resolve';
      const mark = (next, detail = {}) => {
        console.info('Cron ML sync progress', { connectionId: connection.id, phase, elapsedMs: Date.now() - started, ...detail });
        phase = next;
      };
      try {
        const targets = await listMercadoLibreClientTargets(connection.workspaceId, { connectionId: connection.id });
        const target = targets[0];
        if (!target?.client) {
          return { connectionId: connection.id, ok: false, error: 'cliente no disponible' };
        }
        mark('orders');
        const count = await syncMercadoLibreOrders({
          workspaceId: connection.workspaceId,
          client: target.client,
          connectionId: target.connectionId,
          externalStoreId: target.externalStoreId,
          siteId: target.config?.siteId || 'MLA',
          q: '',
          light: true,
          maxPages: 5,
          concurrency: 4,
        });
        mark('notifications', { synced: count });
        await recoverMercadoLibreNotifications(connection.workspaceId, target);
        mark('reconciliation');
        const reconciliation = await reconcileMercadoLibreFinance(connection.workspaceId, target);
        const ok = reconciliation.every((result) => result.ok);
        const result = { connectionId: connection.id, ok, synced: count, reconciliation, elapsedMs: Date.now() - started };
        mark('done', { result });
        return result;
      } catch (error) {
        console.error('Cron ML sync error', { connectionId: connection.id, phase, elapsedMs: Date.now() - started, error: error.message || String(error) });
        return { connectionId: connection.id, ok: false, error: error.message || 'error' };
      }
    };
    const connectionResults = await Promise.all(connections.map(syncConnection));
    for (const result of connectionResults) {
      results.push(result);
      totalSynced += result.synced || 0;
    }

    // Refresh the precomputed finance map once the day's data is in.
    const repository = createFinanceRepository(db);
    for (const workspaceId of new Set(connections.map((connection) => connection.workspaceId))) {
      console.info('Cron ML snapshot start', { workspaceId });
      try { await repository.rebuildSnapshot(workspaceId); console.info('Cron ML snapshot done', { workspaceId }); } catch (error) { console.error('Cron finance snapshot error (workspace', workspaceId, '):', error.message || error); }
    }

    const summary = { ok: results.every((result) => result.ok), connections: connections.length, totalSynced, results };
    console.info('Cron ML sync complete', summary);
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Cron ML sync fatal error:', error);
    return NextResponse.json({ error: error.message || 'Cron sync failed' }, { status: 500 });
  }
}
