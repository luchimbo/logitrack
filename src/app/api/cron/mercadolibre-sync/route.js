import { NextResponse } from 'next/server';
import { listAllActiveIntegrationConnections } from '@/lib/integrationService';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { syncMercadoLibreOrders } from '@/lib/mercadolibreStore';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request) {
  // Vercel Cron envía Authorization: Bearer ${CRON_SECRET} si la env está definida.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const results = [];
  let totalSynced = 0;

  try {
    const connections = await listAllActiveIntegrationConnections({ provider: 'mercadolibre' });
    for (const connection of connections) {
      try {
        const targets = await listMercadoLibreClientTargets(connection.workspaceId, { connectionId: connection.id });
        const target = targets[0];
        if (!target?.client) {
          results.push({ connectionId: connection.id, ok: false, error: 'cliente no disponible' });
          continue;
        }
        const count = await syncMercadoLibreOrders({
          workspaceId: connection.workspaceId,
          client: target.client,
          connectionId: target.connectionId,
          externalStoreId: target.externalStoreId,
          siteId: target.config?.siteId || 'MLA',
          q: '',
          light: true,
        });
        totalSynced += count;
        results.push({ connectionId: connection.id, ok: true, synced: count });
      } catch (error) {
        console.error('Cron ML sync error (connection', connection.id, '):', error.message || error);
        results.push({ connectionId: connection.id, ok: false, error: error.message || 'error' });
      }
    }

    return NextResponse.json({ ok: true, connections: connections.length, totalSynced, results });
  } catch (error) {
    console.error('Cron ML sync fatal error:', error);
    return NextResponse.json({ error: error.message || 'Cron sync failed' }, { status: 500 });
  }
}
