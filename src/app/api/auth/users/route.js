import { clerkClient } from '@clerk/nextjs/server';
import { ensureWorkspaceAccessEmails, resolveWorkspaceTarget, sendWorkspaceAccessEmail } from '@/lib/workspaceAccessEmail';
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

    const actor = await resolveWorkspaceTarget(db, authResult.actor, new URL(request.url).searchParams.get('workspaceId'));
    const workspaceId = actor.workspaceId;
    await ensureWorkspaceAccessEmails(db);
    const result = await db.execute({
      sql: `SELECT wm.id, wm.role, wm.created_at, au.id AS app_user_id, au.email, au.clerk_user_id,
                   CASE WHEN au.clerk_user_id LIKE 'pending:%' THEN 1 ELSE 0 END AS is_pending,
                   ae.status AS email_status, ae.sent_at AS email_sent_at
            FROM workspace_members wm
            JOIN app_users au ON au.id = wm.app_user_id
            LEFT JOIN workspace_access_emails ae ON ae.workspace_id=wm.workspace_id AND ae.app_user_id=wm.app_user_id
            WHERE wm.workspace_id = ?
            ORDER BY au.email ASC`,
      args: [workspaceId],
    });

    const workspaces = actor.isGlobalAdmin ? (await db.execute(`SELECT w.id,w.name,w.slug,
      (SELECT u.email FROM workspace_members m JOIN app_users u ON u.id=m.app_user_id WHERE m.workspace_id=w.id AND m.role='owner' ORDER BY m.id LIMIT 1) AS owner_email
      FROM workspaces w ORDER BY w.id`)).rows : [];
    return NextResponse.json({ users: result.rows, workspace: { id: workspaceId, name: actor.workspaceName }, workspaces });
  } catch (error) {
    if (error instanceof MembershipError) return NextResponse.json({ error: error.message }, { status: error.status });
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
    if (!body || typeof body !== 'object' || Array.isArray(body) || (body.action && body.action !== 'sendAccess')) {
      throw new MembershipError(400, 'Solicitud inválida');
    }
    const actor = await resolveWorkspaceTarget(db, authResult.actor, body.workspaceId);
    if (body.action === 'sendAccess') {
      const emailDelivery = await sendWorkspaceAccessEmail({ db, actor, email: body.email, getClient: clerkClient, appUrl: process.env.NEXT_PUBLIC_APP_URL });
      return NextResponse.json({ success: emailDelivery.status !== 'failed', emailDelivery }, { status: emailDelivery.status === 'failed' ? 502 : 200 });
    }
    const result = await assignWorkspaceUser(db, actor, body);
    let emailDelivery = null;
    if (body.sendEmail === true) {
      try {
        emailDelivery = await sendWorkspaceAccessEmail({ db, actor, email: result.email, getClient: clerkClient, appUrl: process.env.NEXT_PUBLIC_APP_URL });
      } catch {
        // The assignment has committed. Never report it as failed because a
        // notification or its status could not be saved afterward.
        emailDelivery = { status: 'failed', message: 'El acceso quedó asignado, pero no se pudo confirmar el envío. Revisá la lista antes de reenviarlo.' };
      }
    }
    return NextResponse.json({ ...result, workspaceName: actor.workspaceName, emailDelivery });
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

    const body = await request.json();
    const actor = await resolveWorkspaceTarget(db, authResult.actor, body.workspaceId);
    const workspaceId = actor.workspaceId;
    const { membershipId, role } = body;
    const cleanRole = ["admin", "user"].includes(role) ? role : null;

    if (!membershipId || !cleanRole) {
      return NextResponse.json({ error: 'Datos invÃ¡lidos' }, { status: 400 });
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
