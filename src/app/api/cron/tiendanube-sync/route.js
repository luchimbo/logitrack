import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { listAllActiveIntegrationConnections, markIntegrationConnectionAuthError } from '@/lib/integrationService';
import { listTiendanubeClientTargets } from '@/lib/tiendanubeResolver';
import { syncTiendanubeOrders } from '@/lib/tiendanubeStore';
import { finishSyncRun, lastSuccessfulSyncRunAt, startSyncRun, tiendanubeSyncWindowStart } from '@/lib/syncRuns';

// Tiendanube solo se actualizaba con webhooks o con "Actualizar" en la pantalla.
// Este barrido horario trae lo modificado desde la última corrida correcta.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const BUDGET_MS = 240_000;
const MAX_PAGES = 40;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (request.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  try {
    const connections = await listAllActiveIntegrationConnections({ provider: 'tiendanube' });
    const results = [];
    // En serie: la API de Tiendanube limita por tienda y app; evita picos de 429.
    for (const connection of connections) {
      if (Date.now() - started > BUDGET_MS) {
        results.push({ connectionId: connection.id, ok: false, skipped: true });
        continue;
      }
      const connectionStarted = Date.now();
      const since = tiendanubeSyncWindowStart(await lastSuccessfulSyncRunAt(db, connection.id, 'tn-sync').catch(() => null));
      const runId = await startSyncRun(db, {
        workspaceId: connection.workspaceId, connectionId: connection.id, provider: 'tiendanube', job: 'tn-sync',
      }).catch(() => 0);
      const finish = (outcome) => finishSyncRun(db, runId, { ...outcome, elapsedMs: Date.now() - connectionStarted }).catch(() => {});
      try {
        const target = (await listTiendanubeClientTargets(connection.workspaceId, { connectionId: connection.id }))[0];
        if (!target?.client) {
          await finish({ status: 'error', error: 'cliente no disponible' });
          results.push({ connectionId: connection.id, ok: false, error: 'cliente no disponible' });
          continue;
        }
        const stats = {};
        const synced = await syncTiendanubeOrders({
          workspaceId: connection.workspaceId,
          client: target.client,
          connectionId: target.connectionId,
          externalStoreId: target.externalStoreId,
          updatedAtMin: since,
          maxPages: MAX_PAGES,
          stats,
        });
        await finish({
          status: stats.capped ? 'partial' : 'ok',
          error: stats.capped ? `Más de ${MAX_PAGES * 50} pedidos modificados; se completa en la próxima corrida` : null,
          synced,
          details: { since },
        });
        results.push({ connectionId: connection.id, ok: true, synced, capped: Boolean(stats.capped) });
      } catch (error) {
        // 401: la tienda desinstaló la app o revocó el token. Hay que reconectar.
        const needsReauth = Number(error?.status) === 401;
        if (needsReauth) await markIntegrationConnectionAuthError({ id: connection.id, error: 'Tiendanube rechazó el token (401)' }).catch(() => {});
        console.error('Cron Tiendanube sync error', { connectionId: connection.id, status: error?.status, error: error?.message || String(error) });
        await finish({ status: needsReauth ? 'needs_reauth' : 'error', error });
        results.push({ connectionId: connection.id, ok: false, needsReauth, error: error?.message || 'error' });
      }
    }
    const summary = { ok: results.every((result) => result.ok), elapsedMs: Date.now() - started, results };
    console.info('Cron Tiendanube sync complete', summary);
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Cron Tiendanube sync fatal error:', error);
    return NextResponse.json({ error: error.message || 'Cron Tiendanube sync failed' }, { status: 500 });
  }
}
