import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { financeReport } from '@/lib/financeStore';
import { validDate } from '@/lib/shippingFinance';
export async function GET(request) {
  const auth = await requireWorkspaceActor(request);
  if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
  const filters = Object.fromEntries(new URL(request.url).searchParams);
  if ((filters.from && !validDate(filters.from)) || (filters.to && !validDate(filters.to)) || (filters.from && filters.to && filters.from > filters.to)) {
    return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });
  }
  try { return NextResponse.json(await financeReport(auth.actor.workspaceId, filters)); }
  catch (error) { console.error('Finance report:', error); return NextResponse.json({ error: 'No se pudo cargar el análisis' }, { status: 500 }); }
}
