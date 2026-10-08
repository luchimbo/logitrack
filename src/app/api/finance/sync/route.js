import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { syncSingleMercadoLibreOrder } from '@/lib/mercadolibreStore';
import { validDate } from '@/lib/shippingFinance';
export const maxDuration = 300;
export async function POST(request) {
  const auth = await requireWorkspaceActor(request);
  if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
  try {
    const { from, to, connection, offset = 0 } = await request.json();
    if (!validDate(from) || !validDate(to) || from > to || !Number.isInteger(offset) || offset < 0 || offset > 10000) {
      return NextResponse.json({ error: 'Elegí un rango de fechas válido' }, { status: 400 });
    }
    const targets = await listMercadoLibreClientTargets(auth.actor.workspaceId, { connectionId: connection || '' });
    if (!targets.length) return NextResponse.json({ error: 'No hay cuentas de Mercado Libre conectadas' }, { status: 400 });
    let synced = 0, more = false;
    const failures = [];
    for (const target of targets) {
      const page = await target.client.searchOrders({ sellerId: target.externalStoreId, offset, limit: 10, dateFrom: `${from}T00:00:00.000-03:00`, dateTo: `${to}T23:59:59.999-03:00` });
      const orders = page.results || [];
      more ||= orders.length === 10;
      for (let i = 0; i < orders.length; i += 2) await Promise.all(orders.slice(i, i + 2).map(async order => {
        try {
          const full = await syncSingleMercadoLibreOrder({ workspaceId: auth.actor.workspaceId, client: target.client, orderId: String(order.id), connectionId: target.connectionId, externalStoreId: target.externalStoreId, siteId: target.config?.siteId || 'MLA' });
          if (!full?.shipment) throw new Error('Envío no disponible');
          synced++;
        } catch { failures.push({ connectionId: target.connectionId, orderId: String(order.id) }); }
      }));
    }
    return NextResponse.json({ synced, failures, nextOffset: more ? offset + 10 : null });
  } catch (error) {
    console.error('Finance sync:', error);
    return NextResponse.json({ error: 'No se pudo consultar Mercado Libre. Intentá nuevamente.' }, { status: 502 });
  }
}
