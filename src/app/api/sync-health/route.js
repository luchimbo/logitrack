import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';
import { listWorkspaceSyncHealth } from '@/lib/syncRuns';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    const { workspaceId } = authResult.actor;
    if (!workspaceId) return NextResponse.json({ connections: [] });
    const connections = await listWorkspaceSyncHealth(db, workspaceId);
    return NextResponse.json({ connections });
  } catch (error) {
    console.error('Sync health error:', error?.message || error);
    return NextResponse.json({ error: 'No se pudo leer el estado de la sincronización' }, { status: 500 });
  }
}
