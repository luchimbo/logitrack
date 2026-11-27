import { NextResponse } from 'next/server';
import { listAllActiveIntegrationConnections } from '@/lib/integrationService';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { closeDeliveredOrders, refreshOpenOrders } from '@/lib/mercadolibreRefresh';
import { db } from '@/lib/db';
import { finishSyncRun, startSyncRun } from '@/lib/syncRuns';

// Separate from the daily sync so completing open orders has the whole 300 s window to itself.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const BUDGET_MS = 250_000;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (request.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  try {
    const connections = await listAllActiveIntegrationConnections({ provider: 'mercadolibre' });
    const results = await Promise.all(connections.map(async (connection) => {
      const connectionStarted = Date.now();
      const runId = await startSyncRun(db, {
        workspaceId: connection.workspaceId, connectionId: connection.id, provider: 'mercadolibre', job: 'ml-upkeep',
      }).catch(() => 0);
      const finish = (outcome) => finishSyncRun(db, runId, { ...outcome, elapsedMs: Date.now() - connectionStarted }).catch(() => {});
      try {
        const target = (await listMercadoLibreClientTargets(connection.workspaceId, { connectionId: connection.id }))[0];
        if (!target?.client) {
          await finish({ status: 'error', error: 'cliente no disponible' });
          return { connectionId: connection.id, ok: false, error: 'cliente no disponible' };
        }
        const closed = await closeDeliveredOrders(target.connectionId);
        const refresh = await refreshOpenOrders(connection.workspaceId, target, { deadline: started + BUDGET_MS });
        await finish({ status: 'ok', details: { closed, ...refresh } });
        return { connectionId: connection.id, ok: true, closed, ...refresh };
      } catch (error) {
        console.error('Cron ML upkeep error (connection', connection.id, '):', error.message || error);
        await finish({ status: error?.code === 'needs_reauth' ? 'needs_reauth' : 'error', error });
        return { connectionId: connection.id, ok: false, error: error.message || 'error' };
      }
    }));
    // Resultado por cuenta en los logs: antes solo se veía el HTTP 200.
    console.info('Cron ML upkeep complete', { elapsedMs: Date.now() - started, results });
    return NextResponse.json({ ok: results.every((result) => result.ok), results });
  } catch (error) {
    console.error('Cron ML upkeep fatal error:', error);
    return NextResponse.json({ error: error.message || 'Cron upkeep failed' }, { status: 500 });
  }
}
