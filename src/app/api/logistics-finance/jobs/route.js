import { NextResponse, after } from 'next/server';
import { requireWorkspaceActor, requireWorkspaceAdmin } from '@/lib/auth';
import { ensureDb } from '@/lib/ensureDb';
import { db } from '@/lib/db';
import { createFinanceRepository } from '@/lib/financeRepository';
import { claimSettlementFetch, listSettlementFetchJobs, markSettlementFetchNotified, runSettlementFetchStep, startSettlementFetch } from '@/lib/settlementFetch';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const repository = createFinanceRepository(db);

// Polled by the open app: reports the background searches and, when one is free, advances it after the response.
export async function GET(request) {
  try {
    await ensureDb();
    const auth = await requireWorkspaceActor(request);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const workspaceId = auth.actor.workspaceId;
    const jobs = await listSettlementFetchJobs(workspaceId);
    if (jobs.some((j) => j.status === 'running')) {
      const claimed = await claimSettlementFetch(workspaceId);
      if (claimed) after(() => runSettlementFetchStep(workspaceId, claimed, { rebuildSnapshot: repository.rebuildSnapshot })
        .catch((error) => console.error('Settlement fetch step failed:', error.message)));
    }
    return NextResponse.json({ jobs }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return NextResponse.json({ error: error.message || 'No se pudo consultar' }, { status: 500 }); }
}

export async function POST(request) {
  try {
    await ensureDb();
    const input = await request.json();
    const auth = input.action === 'notified' ? await requireWorkspaceActor(request) : await requireWorkspaceAdmin(request);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const workspaceId = auth.actor.workspaceId;
    if (input.action === 'notified') {
      await markSettlementFetchNotified(workspaceId, (Array.isArray(input.ids) ? input.ids : []).slice(0, 50));
      return NextResponse.json({ ok: true });
    }
    if (input.action === 'fetch') {
      const found = await db.execute({ sql: 'SELECT id FROM carrier_settlements WHERE workspace_id=? AND id=?', args: [workspaceId, Number(input.id)] });
      if (!found.rows.length) return NextResponse.json({ error: 'Liquidación no encontrada' }, { status: 404 });
      await startSettlementFetch(workspaceId, Number(input.id));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error.message || 'No se pudo guardar' }, { status: 400 }); }
}
