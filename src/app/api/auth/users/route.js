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

    const workspaceId = authResult.actor.workspaceId;
    const body = await request.json();
    const email = (body.email || "").trim().toLowerCase();
    const role = body.role || "user";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
    }
    if (!["admin", "user"].includes(role)) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
    }

    let existingUser = await db.execute({
      sql: "SELECT id FROM app_users WHERE email = ?",
      args: [email],
    });

    if (!existingUser.rows.length) {
      const inserted = await db.execute({
        sql: "INSERT INTO app_users (clerk_user_id, email) VALUES (?, ?)",
        args: [`pending:${email}`, email],
      });
      existingUser = { rows: [{ id: Number(inserted.lastInsertRowid) }] };
    }

    const appUserId = Number(existingUser.rows[0].id);

    const existingMembership = await db.execute({
      sql: "SELECT id FROM workspace_members WHERE workspace_id = ? AND app_user_id = ?",
      args: [workspaceId, appUserId],
    });

    if (existingMembership.rows.length) {
      return NextResponse.json({ error: 'El usuario ya es miembro de este workspace' }, { status: 409 });
    }

    await db.execute({
      sql: "INSERT INTO workspace_members (workspace_id, app_user_id, role) VALUES (?, ?, ?)",
      args: [workspaceId, appUserId, role],
    });

    await logAudit({
      workspaceId,
      appUserId: authResult.actor.appUserId,
      actorType: authResult.actor.authType,
      actorLabel: authResult.actor.email || authResult.actor.username,
      action: 'add_workspace_user',
      entityType: 'workspace_member',
      entityId: appUserId,
      metadata: { email, role },
    });

    return NextResponse.json({ success: true, email, role });
  } catch (error) {
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
