import { NextResponse, after } from 'next/server';
import { requireWorkspaceActor, requireWorkspaceAdmin } from '@/lib/auth';
import { ensureDb } from '@/lib/ensureDb';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { createFinanceRepository } from '@/lib/financeRepository';
import { csv, validDate } from '@/lib/logisticsFinance';
import { startSettlementFetch } from '@/lib/settlementFetch';
import { listIntegrationConnections } from '@/lib/integrationService';

export const dynamic = 'force-dynamic';
const repository = createFinanceRepository(db);
const columns = [['Envío','shipmentId'],['Cuenta','sellerId'],['Modalidad','method'],['Transportista','carrierName'],['Provincia','province'],['Zona','zone'],['Partido','partido'],['Despacho','dispatchDay'],['Entrega','deliveryDay'],['Estado','stateLabel'],['Importe ARS', (r) => r.amountCents === null ? '' : (r.amountCents / 100).toFixed(2)],['Ventas brutas ARS', (r) => r.salesCents == null ? '' : (r.salesCents / 100).toFixed(2)],['Envío cobrado TN ARS', (r) => r.shippingCollectedCents == null ? '' : (r.shippingCollectedCents / 100).toFixed(2)],['Cargos ML ARS', (r) => r.feesCents == null ? '' : (r.feesCents / 100).toFixed(2)],['Pedidos pagados','paidOrderCount'],['Ventas no computables','salesMissingCount'],['Observación','missing']];
function csvResponse(rows, selectedColumns, name) {
  return new Response(csv(rows, selectedColumns), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"`, 'Cache-Control': 'no-store' } });
}
export async function GET(request) {
  try {
    await ensureDb();
    const auth = await requireWorkspaceActor(request);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const workspaceId = auth.actor.workspaceId;
    const p = new URL(request.url).searchParams;
    if (p.get('view') === 'rates') return NextResponse.json({ rates: await repository.listRates(workspaceId) });
    if (p.get('view') === 'settlements') {
      if (p.get('id')) {
        const detail = await repository.settlementDetail(workspaceId, Number(p.get('id')), undefined, { fast: true });
        if (p.get('format') === 'csv') return csvResponse([...detail.items,
          ...detail.adjustments.map((a) => ({ shipmentId: 'AJUSTE', amountCents: Number(a.amount_cents), missing: a.reason })),
        ], columns, `liquidacion-${p.get('id')}`);
        // Account names for the detailed download (PCMIDICENTER, ARTURIA ARGENTINA…).
        const accounts = Object.fromEntries((await listIntegrationConnections({ workspaceId, provider: 'mercadolibre' }).catch(() => [])).map((c) => [c.id, c.displayName]));
        return NextResponse.json({ ...detail, accounts });
      }
      return NextResponse.json({ settlements: await repository.listSettlements(workspaceId) });
    }
    // Full detail of one shipment (history, sync dates), read on demand from the Detalle tab.
    if (p.get('view') === 'shipment') {
      const [row] = await repository.records(workspaceId, db, { connectionId: Number(p.get('connectionId')), shipmentId: p.get('shipmentId') });
      return row ? NextResponse.json(row) : NextResponse.json({ error: 'Envío no encontrado' }, { status: 404 });
    }
    const filters = Object.fromEntries(p);
    if (filters.from && !validDate(filters.from) || filters.to && !validDate(filters.to) || filters.from && filters.to && filters.from > filters.to) return NextResponse.json({ error: 'Período inválido' }, { status: 400 });
    const report = await repository.report(workspaceId, filters, { compact: ['map', 'targets'].includes(p.get('view')) && p.get('format') !== 'csv', withRows: p.get('view') === 'detail', withTargets: p.get('view') === 'targets', refresh: p.get('refresh') === '1', scheduleRefresh: (job) => after(job) });
    if (p.get('format') === 'csv') return csvResponse(report.rows, columns, 'gastos-envios');
    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return NextResponse.json({ error: error.message || 'No se pudo cargar' }, { status: 500 }); }
}
export async function POST(request) {
  try {
    await ensureDb();
    const auth = await requireWorkspaceAdmin(request);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const workspaceId = auth.actor.workspaceId;
    if (!workspaceId) return NextResponse.json({ error: 'Elegí un espacio de trabajo' }, { status: 400 });
    const input = await request.json();
    const actorId = auth.actor.appUserId || null;
    if (input.action === 'rate') {
      const result = await repository.saveRate(workspaceId, input, actorId);
      await logAudit({ workspaceId, appUserId: actorId, actorType: 'user', action: 'carrier_rate.create', entityType: 'carrier_rate', entityId: result.lastInsertRowid, metadata: input });
      return NextResponse.json({ ok: true });
    }
    if (input.action === 'rates') {
      if (!Array.isArray(input.rates) || !input.rates.length || input.rates.length > 20) return NextResponse.json({ error: 'Tarifas inválidas' }, { status: 400 });
      for (const rate of input.rates) await repository.saveRate(workspaceId, rate, actorId);
      await logAudit({ workspaceId, appUserId: actorId, actorType: 'user', action: 'carrier_rate.create', entityType: 'carrier_rate', entityId: String(input.rates[0].carrierId), metadata: input });
      return NextResponse.json({ ok: true });
    }
    if (input.action === 'draft') {
      const id = await repository.createSettlement(workspaceId, input, actorId);
      // The period may predate the data already synced: search it in Mercado Libre in the background.
      await startSettlementFetch(workspaceId, id);
      await logAudit({ workspaceId, appUserId: actorId, actorType: 'user', action: 'settlement.draft', entityType: 'carrier_settlement', entityId: id, metadata: input });
      return NextResponse.json({ ok: true, id });
    }
    await repository.mutateSettlement(workspaceId, Number(input.id), input.action, input, actorId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const conflict = /UNIQUE|constraint|ya está cerrada/i.test(error.message);
    return NextResponse.json({ error: conflict ? 'Conflicto: la tarifa ya existe o los envíos ya se liquidaron. Actualizá y revisá el detalle.' : error.message }, { status: conflict ? 409 : 400 });
  }
}
