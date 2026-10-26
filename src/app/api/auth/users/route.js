import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { assignWorkspaceUser, MembershipError } from '@/lib/workspaceMembership';

export async function GET(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const workspaceId = authResult.actor.workspaceId;
    const result = await db.execute({
      sql: `SELECT wm.id, wm.role, wm.created_at, au.id AS app_user_id, au.email, au.clerk_user_id,
                   CASE WHEN au.clerk_user_id LIKE 'pending:%' THEN 1 ELSE 0 END AS is_pending
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

export async function POST(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const body = await request.json();
    return NextResponse.json(await assignWorkspaceUser(db, authResult.actor, body));
  } catch (error) {
    if (error instanceof MembershipError) {
      return NextResponse.json({ error: error.message, code: error.code, canReassign: error.canReassign }, { status: error.status });
    }
    console.error('Add workspace user error:', error);
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
    const cleanRole = ["admin", "user"].includes(role) ? role : null;

    if (!membershipId || !cleanRole) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    const updated = await db.execute({
      sql: "UPDATE workspace_members SET role = ? WHERE id = ? AND workspace_id = ? AND role <> 'owner'",
      args: [cleanRole, membershipId, workspaceId],
    });
    if (!updated.rowsAffected) {
      return NextResponse.json({ error: 'Miembro no encontrado o es propietario del espacio' }, { status: 409 });
    }

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
