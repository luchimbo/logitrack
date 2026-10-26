import { MembershipError } from './workspaceMembership.js';

export async function ensureWorkspaceAccessEmails(db) {
  await db.execute(`CREATE TABLE IF NOT EXISTS workspace_access_emails (
    workspace_id INTEGER NOT NULL, app_user_id INTEGER NOT NULL,
    status TEXT NOT NULL, attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TEXT, invitation_id TEXT,
    PRIMARY KEY (workspace_id, app_user_id)
  )`);
}

export async function resolveWorkspaceTarget(db, actor, requestedId) {
  const workspaceId = requestedId == null ? Number(actor.workspaceId) : Number(requestedId);
  if (!Number.isSafeInteger(workspaceId) || workspaceId <= 0) throw new MembershipError(400, 'Elegí un espacio válido');
  if (!actor.isGlobalAdmin && workspaceId !== Number(actor.workspaceId)) throw new MembershipError(403, 'Solo podés gestionar tu espacio');
  const workspace = (await db.execute({ sql: 'SELECT id, name, slug FROM workspaces WHERE id=?', args: [workspaceId] })).rows[0];
  if (!workspace) throw new MembershipError(404, 'El espacio ya no está disponible');
  return { ...actor, workspaceId, workspaceName: workspace.slug === 'legacy' ? 'GeoModi' : workspace.name };
}

// Clerk handles delivery and identity verification. Application access is always
// granted by workspace_members, never by the invitation or its public metadata.
export async function sendWorkspaceAccessEmail({ db, actor, email, getClient, appUrl }) {
  if (!actor.isGlobalAdmin && !['owner', 'admin'].includes(actor.role)) throw new MembershipError(403, 'Permisos insuficientes');
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const target = (await db.execute({
    sql: `SELECT u.id FROM app_users u JOIN workspace_members m ON m.app_user_id=u.id
          WHERE lower(u.email)=? AND m.workspace_id=?`, args: [normalized, actor.workspaceId],
  })).rows;
  if (target.length !== 1) throw new MembershipError(404, 'El usuario no está asignado a este espacio');
  const userId = Number(target[0].id);
  const memberships = (await db.execute({ sql: 'SELECT workspace_id FROM workspace_members WHERE app_user_id=?', args: [userId] })).rows;
  if (memberships.length !== 1) throw new MembershipError(409, 'Primero reasigná al usuario a un único espacio para enviarle el acceso');
  await ensureWorkspaceAccessEmails(db);
  const claim = await db.execute({
    sql: `INSERT INTO workspace_access_emails (workspace_id,app_user_id,status) VALUES (?,?,'sending')
          ON CONFLICT(workspace_id,app_user_id) DO UPDATE SET status='sending',attempted_at=CURRENT_TIMESTAMP
          WHERE workspace_access_emails.attempted_at <= datetime('now','-60 seconds')`,
    args: [actor.workspaceId, userId],
  });
  if (!claim.rowsAffected) return { status: 'cooldown', message: 'Esperá un minuto antes de volver a enviar el acceso.' };

  let delivery;
  try {
    const origin = new URL(appUrl || 'https://www.geomodi.ai');
    if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Invalid application origin');
    const client = await getClient();
    // A pending local identity may already have an account in Clerk.
    const existing = await client.users.getUserList({ emailAddress: [normalized], limit: 1 });
    const registered = existing.data.length > 0;
    const invitation = await client.invitations.createInvitation({
      emailAddress: normalized, ignoreExisting: true, notify: true, expiresInDays: 7,
      redirectUrl: new URL(`/workspace-access?registered=${registered ? '1' : '0'}`, origin.origin).href,
    });
    await db.execute({
      sql: `UPDATE workspace_access_emails SET status='sent',sent_at=CURRENT_TIMESTAMP,invitation_id=? WHERE workspace_id=? AND app_user_id=?`,
      args: [invitation.id, actor.workspaceId, userId],
    });
    delivery = { status: 'sent', message: 'Correo de acceso enviado.', accountRegistered: registered };
  } catch (error) {
    // Do not log provider payloads: invitation URLs contain authentication tickets.
    console.error('Workspace access email failed:', error?.status || error?.code || 'delivery_error');
    await db.execute({ sql: "UPDATE workspace_access_emails SET status='failed' WHERE workspace_id=? AND app_user_id=?", args: [actor.workspaceId, userId] });
    delivery = { status: 'failed', message: 'El acceso quedó asignado, pero no se pudo enviar el correo. Podés reenviarlo desde la lista.' };
  }
  await db.execute({
    sql: `INSERT INTO audit_logs (workspace_id,app_user_id,actor_type,actor_label,action,entity_type,entity_id,metadata_json)
          VALUES (?,?,?,?,'workspace_access_email','workspace_member',?,?)`,
    args: [actor.workspaceId, actor.appUserId ?? null, actor.authType, actor.email || actor.username || null, String(userId), JSON.stringify({ email: normalized, status: delivery.status })],
  });
  return delivery;
}
