import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';
import { carrierConfigScope } from '@/lib/globalCarrierConfig';
import { getOnboardingStatus } from '@/lib/onboardingStatus';

export async function GET(request) {
  try {
    await ensureDb();
    const auth = await requireWorkspaceActor(request);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const id = auth.actor.workspaceId;
    const scope = await carrierConfigScope(id);
    const status = await getOnboardingStatus(db, id, scope);
    return NextResponse.json(status, { headers: { 'Cache-Control':'no-store' } });
  } catch (error) {
    console.error('Initial setup status error:', error);
    return NextResponse.json({ error:'No pudimos cargar los primeros pasos. Intentá de nuevo.' }, { status:500 });
  }
}
