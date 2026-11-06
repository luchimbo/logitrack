export class MembershipError extends Error {
  constructor(status, message, code = undefined, canReassign = false) {
    super(message);
    this.status = status;
    this.code = code;
    this.canReassign = canReassign;
  }
}

// Membership changes and their audit entry must either all commit or all roll back.
export async function assignWorkspaceUser(db, actor, input) {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const role = input.role ?? 'user';
  const reassign = input.reassign === true;
  if (!actor.workspaceId || (!actor.isGlobalAdmin && !['owner', 'admin'].includes(actor.role))) {
    throw new MembershipError(403, 'Permisos insuficientes');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new MembershipError(400, 'Email inválido');
  if (!['admin', 'user'].includes(role)) throw new MembershipError(400, 'Rol inválido');
  if (reassign && !actor.isGlobalAdmin) throw new MembershipError(403, 'Solo el administrador global puede reasignar usuarios');

  const tx = await db.transaction('write');
  try {
    let user = (await tx.execute({ sql: 'SELECT id, clerk_user_id, is_global_admin FROM app_users WHERE lower(email) = ?', args: [email] })).rows;
    if (user.length > 1) throw new MembershipError(409, 'Hay más de una cuenta con ese email. Revisá las cuentas antes de continuar');
    user = user[0];
    if (!user) {
      const inserted = await tx.execute({ sql: 'INSERT INTO app_users (clerk_user_id, email) VALUES (?, ?)', args: [`pending:${email}`, email] });
      user = { id: Number(inserted.lastInsertRowid), clerk_user_id: `pending:${email}`, is_global_admin: 0 };
    }
    const memberships = (await tx.execute({ sql: 'SELECT workspace_id, role FROM workspace_members WHERE app_user_id = ?', args: [user.id] })).rows;
    const others = memberships.filter(m => Number(m.workspace_id) !== Number(actor.workspaceId));
    const current = memberships.find(m => Number(m.workspace_id) === Number(actor.workspaceId));
    if (others.length && !reassign) {
      throw new MembershipError(409, 'Este usuario pertenece a otro espacio de trabajo', 'OTHER_WORKSPACE', Boolean(actor.isGlobalAdmin));
    }
    if (reassign && (Number(user.is_global_admin) === 1 || Number(user.id) === Number(actor.appUserId))) {
      throw new MembershipError(403, 'No se puede reasignar al administrador global ni a tu propia cuenta');
    }
    const finalRole = current?.role === 'owner' ? 'owner' : role;
    await tx.execute({
      sql: `INSERT INTO workspace_members (workspace_id, app_user_id, role) VALUES (?, ?, ?)
            ON CONFLICT(workspace_id, app_user_id) DO UPDATE SET role = excluded.role`,
      args: [actor.workspaceId, user.id, finalRole],
    });
    if (reassign) await tx.execute({ sql: 'DELETE FROM workspace_members WHERE app_user_id = ? AND workspace_id <> ?', args: [user.id, actor.workspaceId] });
    await tx.execute({
      sql: `INSERT INTO audit_logs (workspace_id, app_user_id, actor_type, actor_label, action, entity_type, entity_id, metadata_json)
            VALUES (?, ?, ?, ?, ?, 'workspace_member', ?, ?)`,
      args: [actor.workspaceId, actor.appUserId ?? null, actor.authType, actor.email || actor.username || null,
        others.length ? 'reassign_workspace_user' : current ? 'change_workspace_role' : 'add_workspace_user', String(user.id),
        JSON.stringify({ email, role: finalRole, previousMemberships: memberships, reassign })],
    });
    await tx.commit();
    return { success: true, email, role: finalRole, isPending: user.clerk_user_id.startsWith('pending:'), reassigned: others.length > 0, updated: Boolean(current) };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
