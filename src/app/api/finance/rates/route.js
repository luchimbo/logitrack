import { NextResponse } from 'next/server';
import { requireWorkspaceActor, requireWorkspaceAdmin } from '@/lib/auth';
import { ensureDb } from '@/lib/ensureDb';
import { db } from '@/lib/db';
import { listRates, listFinanceOrders, recordFlexCharges } from '@/lib/financeStore';
import { FINANCE_ZONES, validDate, moneyCents } from '@/lib/shippingFinance';
export async function GET(request) {
  const auth = await requireWorkspaceActor(request);
  if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
  try { await ensureDb(); return NextResponse.json(await listRates(auth.actor.workspaceId)); }
  catch { return NextResponse.json({ error: 'No se pudieron cargar las tarifas' }, { status: 500 }); }
}
export async function POST(request) {
  const auth = await requireWorkspaceAdmin(request);
  if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
  try {
    const body = await request.json();
    if (!validDate(body.effectiveFrom) || !body.carrier || !FINANCE_ZONES.every(zone => moneyCents(body.prices?.[zone]) !== null)) {
      return NextResponse.json({ error: 'Completá transportista, fecha válida y las cuatro tarifas no negativas' }, { status: 400 });
    }
    await ensureDb();
    const carrier = await db.execute({ sql: 'SELECT name FROM carriers WHERE name = ?', args: [body.carrier] });
    if (!carrier.rows.length) return NextResponse.json({ error: 'Transportista desconocido' }, { status: 400 });
    const workspaceId = auth.actor.workspaceId;
    // Freeze all resolvable deliveries with the previous schedule before accepting a new version.
    const [orders, rates] = await Promise.all([listFinanceOrders(workspaceId), listRates(workspaceId)]);
    await recordFlexCharges(workspaceId, orders, rates);
    await db.batch(FINANCE_ZONES.map(zone => ({
      sql: `INSERT INTO carrier_rates (workspace_id, carrier_name, zone, effective_from, amount_cents) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(workspace_id, carrier_name, zone, effective_from) DO UPDATE SET amount_cents = excluded.amount_cents`,
      args: [workspaceId, body.carrier, zone, body.effectiveFrom, moneyCents(body.prices[zone])],
    })), 'write');
    await recordFlexCharges(workspaceId, orders, await listRates(workspaceId));
    return NextResponse.json({ saved: true }, { status: 201 });
  } catch (error) {
    const conflict = String(error.message).includes('UNIQUE');
    return NextResponse.json({ error: conflict ? 'Ya existe una tarifa para ese transportista y fecha; elegí otra vigencia' : 'No se pudieron guardar las tarifas' }, { status: conflict ? 409 : 500 });
  }
}
