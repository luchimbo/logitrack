import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function PATCH(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const actor = authResult.actor;
    if (!actor.appUserId) {
      return NextResponse.json({ success: true, onboarding_completed: true });
    }

    const body = await request.json().catch(() => ({}));
    const completed = body?.completed !== false;

    await db.execute({
      sql: 'UPDATE app_users SET onboarding_completed = ? WHERE id = ?',
      args: [1, actor.appUserId],
    });

    await logAudit({
      workspaceId: actor.workspaceId,
      appUserId: actor.appUserId,
      actorType: actor.authType,
      actorLabel: actor.email || actor.username,
      action: completed ? 'complete_onboarding' : 'dismiss_onboarding',
      entityType: 'user',
      entityId: actor.appUserId,
    });

    return NextResponse.json({ success: true, onboarding_completed: true, dismissed: !completed });
  } catch (error) {
    console.error('Onboarding update error:', error);
    return NextResponse.json({ error: 'Error al actualizar onboarding' }, { status: 500 });
  }
}
