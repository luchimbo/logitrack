import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function GET(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const workspaceId = authResult.actor.workspaceId;
    const result = await db.execute({
      sql: `SELECT wm.id, wm.role, wm.created_at, au.id AS app_user_id, au.email, au.clerk_user_id
            FROM workspace_members wm
            JOIN app_users au ON au.id = wm.app_user_id
            WHERE wm.workspace_id = ?
            ORDER BY au.email ASC`,
      args: [workspaceId],
    });

    return NextResponse.json({ users: result.rows });
  } catch (error) {
    console.error('List workspace users error:', error);
    return NextResponse.json({ error: 'Error en el servidor' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const workspaceId = authResult.actor.workspaceId;
    const { membershipId, role } = await request.json();
    const cleanRole = ["owner", "admin", "user"].includes(role) ? role : null;

    if (!membershipId || !cleanRole) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    await db.execute({
      sql: 'UPDATE workspace_members SET role = ? WHERE id = ? AND workspace_id = ?',
      args: [cleanRole, membershipId, workspaceId],
    });

    await logAudit({
      workspaceId,
      appUserId: authResult.actor.appUserId,
      actorType: authResult.actor.authType,
      actorLabel: authResult.actor.email || authResult.actor.username,
      action: 'change_workspace_role',
      entityType: 'workspace_member',
      entityId: membershipId,
      metadata: { role: cleanRole },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update workspace user role error:', error);
    return NextResponse.json({ error: 'Error en el servidor' }, { status: 500 });
  }
}
