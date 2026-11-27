import { NextResponse } from 'next/server';
import { listAllActiveIntegrationConnections } from '@/lib/integrationService';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { syncMercadoLibreOrders } from '@/lib/mercadolibreStore';
import { db } from '@/lib/db';
import { createFinanceRepository } from '@/lib/financeRepository';
import { reconcileMercadoLibreFinance, recoverMercadoLibreNotifications } from '@/lib/financeReconciliation';
import { finishSyncRun, pruneSyncRuns, startSyncRun } from '@/lib/syncRuns';

// El cron debe poder completar todas las cuentas aunque la API de ML esté lenta.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Vercel corta a los 300 s sin dejar respuesta. Pasado este presupuesto se saltean
// las fases que faltan, para terminar y registrar el resultado en vez de recibir un 504.
const BUDGET_MS = 255_000;

export async function GET(request) {
  // Vercel Cron envía Authorization: Bearer ${CRON_SECRET} si la env está definida.
  const secret = process.env.CRON_SECRET;
  if (!secret || (request.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cronStarted = Date.now();
  const inBudget = () => Date.now() - cronStarted < BUDGET_MS;
  const results = [];
  let totalSynced = 0;

  try {
    const connections = await listAllActiveIntegrationConnections({ provider: 'mercadolibre' });
    const syncConnection = async (connection) => {
      const started = Date.now();
      const phases = {};
      const skipped = [];
      let phase = 'resolve';
      let phaseStarted = started;
      const mark = (next, detail = {}) => {
        phases[phase] = Date.now() - phaseStarted;
        console.info('Cron ML sync progress', { connectionId: connection.id, phase, elapsedMs: Date.now() - started, ...detail });
        phase = next;
        phaseStarted = Date.now();
      };
      const runId = await startSyncRun(db, {
        workspaceId: connection.workspaceId, connectionId: connection.id, provider: 'mercadolibre', job: 'ml-sync',
      }).catch((error) => { console.error('Cron ML sync run log error', error?.message || error); return 0; });
      const finish = (outcome) => finishSyncRun(db, runId, { ...outcome, elapsedMs: Date.now() - started })
        .catch((error) => console.error('Cron ML sync run log error', error?.message || error));

      try {
        const targets = await listMercadoLibreClientTargets(connection.workspaceId, { connectionId: connection.id });
        const target = targets[0];
        if (!target?.client) {
          await finish({ status: 'error', error: 'cliente no disponible' });
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
        if (inBudget()) await recoverMercadoLibreNotifications(connection.workspaceId, target);
        else skipped.push('notifications');
        mark('reconciliation');
        let reconciliation = [];
        if (inBudget()) reconciliation = await reconcileMercadoLibreFinance(connection.workspaceId, target);
        else skipped.push('reconciliation');
        mark('done');
        const reconciled = reconciliation.every((result) => result.ok);
        const ok = reconciled && !skipped.length;
        const result = { connectionId: connection.id, ok, synced: count, reconciliation, skipped, phases, elapsedMs: Date.now() - started };
        await finish({
          status: ok ? 'ok' : 'partial',
          error: skipped.length ? `Sin tiempo para: ${skipped.join(', ')}` : reconciled ? null : 'La conciliación de finanzas no terminó bien',
          synced: count,
          details: { phases, skipped, reconciliation },
        });
        console.info('Cron ML sync connection done', { result });
        return result;
      } catch (error) {
        const needsReauth = error?.code === 'needs_reauth';
        console.error('Cron ML sync error', { connectionId: connection.id, phase, elapsedMs: Date.now() - started, error: error.message || String(error) });
        await finish({ status: needsReauth ? 'needs_reauth' : 'error', error, details: { phase, phases } });
        return { connectionId: connection.id, ok: false, phase, needsReauth, error: error.message || 'error' };
      }
    };
    const connectionResults = await Promise.all(connections.map(syncConnection));
    for (const result of connectionResults) {
      results.push(result);
      totalSynced += result.synced || 0;
    }

    // Refresh the precomputed finance map once the day's data is in.
    const repository = createFinanceRepository(db);
    const snapshotsSkipped = [];
    for (const workspaceId of new Set(connections.map((connection) => connection.workspaceId))) {
      if (!inBudget()) { snapshotsSkipped.push(workspaceId); continue; }
      console.info('Cron ML snapshot start', { workspaceId });
      try { await repository.rebuildSnapshot(workspaceId); console.info('Cron ML snapshot done', { workspaceId }); } catch (error) { console.error('Cron finance snapshot error (workspace', workspaceId, '):', error.message || error); }
    }
    if (snapshotsSkipped.length) console.warn('Cron ML snapshot skipped (budget)', { workspaces: snapshotsSkipped });

    await pruneSyncRuns(db).catch((error) => console.error('Cron ML sync prune error', error?.message || error));

    const summary = {
      ok: results.every((result) => result.ok) && !snapshotsSkipped.length,
      connections: connections.length,
      totalSynced,
      elapsedMs: Date.now() - cronStarted,
      snapshotsSkipped,
      results,
    };
    console.info('Cron ML sync complete', summary);
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Cron ML sync fatal error:', error);
    return NextResponse.json({ error: error.message || 'Cron sync failed' }, { status: 500 });
  }
}
