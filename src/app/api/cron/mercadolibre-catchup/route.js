import { NextResponse } from 'next/server';
import { listAllActiveIntegrationConnections } from '@/lib/integrationService';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { syncMercadoLibreOrders } from '@/lib/mercadolibreStore';
import { recoverMercadoLibreNotifications } from '@/lib/financeReconciliation';
import { db } from '@/lib/db';
import { finishSyncRun, startSyncRun } from '@/lib/syncRuns';

// Recuperación liviana cada hora: los avisos de ML que fallaron y la última página de ventas.
// Así un webhook perdido a la mañana no espera al sync diario del día siguiente.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const BUDGET_MS = 240_000;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (request.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const inBudget = () => Date.now() - started < BUDGET_MS;
  try {
    const connections = await listAllActiveIntegrationConnections({ provider: 'mercadolibre' });
    const results = await Promise.all(connections.map(async (connection) => {
      const connectionStarted = Date.now();
      const runId = await startSyncRun(db, {
        workspaceId: connection.workspaceId, connectionId: connection.id, provider: 'mercadolibre', job: 'ml-catchup',
      }).catch(() => 0);
      const finish = (outcome) => finishSyncRun(db, runId, { ...outcome, elapsedMs: Date.now() - connectionStarted }).catch(() => {});
      try {
        const target = (await listMercadoLibreClientTargets(connection.workspaceId, { connectionId: connection.id }))[0];
        if (!target?.client) {
          await finish({ status: 'error', error: 'cliente no disponible' });
          return { connectionId: connection.id, ok: false, error: 'cliente no disponible' };
        }
        await recoverMercadoLibreNotifications(connection.workspaceId, target, 30);
        let synced = 0;
        if (inBudget()) {
          synced = await syncMercadoLibreOrders({
            workspaceId: connection.workspaceId,
            client: target.client,
            connectionId: target.connectionId,
            externalStoreId: target.externalStoreId,
            siteId: target.config?.siteId || 'MLA',
            q: '',
            light: true,
            maxPages: 1,
            concurrency: 4,
          });
        }
        await finish({ status: 'ok', synced });
        return { connectionId: connection.id, ok: true, synced };
      } catch (error) {
        console.error('Cron ML catch-up error', { connectionId: connection.id, error: error.message || String(error) });
        await finish({ status: error?.code === 'needs_reauth' ? 'needs_reauth' : 'error', error });
        return { connectionId: connection.id, ok: false, error: error.message || 'error' };
      }
    }));
    const summary = { ok: results.every((result) => result.ok), elapsedMs: Date.now() - started, results };
    console.info('Cron ML catch-up complete', summary);
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Cron ML catch-up fatal error:', error);
    return NextResponse.json({ error: error.message || 'Cron catch-up failed' }, { status: 500 });
  }
}
