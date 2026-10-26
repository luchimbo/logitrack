import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createClient } from '@libsql/client';
import { assignWorkspaceUser } from '../src/lib/workspaceMembership.js';

// Read-only by default. --apply performs the user-requested assignments using
// the same transaction and audit logic as the authenticated API.
const env = parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'));
if (!env.TURSO_DATABASE_URL_PROD || !env.TURSO_AUTH_TOKEN_PROD) throw new Error('Faltan credenciales explícitas de producción');
const db = createClient({ url: env.TURSO_DATABASE_URL_PROD, authToken: env.TURSO_AUTH_TOKEN_PROD });
const emails = ['luciopcmidi@gmail.com', 'guillermo@pcmidicenter.com'];
try {
  const owners = (await db.execute({
    sql: `SELECT u.id, u.email, u.is_global_admin, wm.workspace_id, wm.role
          FROM app_users u JOIN workspace_members wm ON wm.app_user_id=u.id
          JOIN workspaces w ON w.id=wm.workspace_id
          WHERE lower(u.email)=? AND w.slug='legacy' AND wm.role='owner'`,
    args: ['camilopcmidi@gmail.com'],
  })).rows;
  if (owners.length !== 1 || Number(owners[0].is_global_admin) !== 1) throw new Error('No se pudo identificar inequívocamente el espacio de Camilo');
  const owner = owners[0];
  const actor = { appUserId: Number(owner.id), workspaceId: Number(owner.workspace_id), email: owner.email, role: 'owner', isGlobalAdmin: true, authType: 'maintenance' };
  const inspect = async () => (await db.execute({
    sql: `SELECT u.email, u.clerk_user_id LIKE 'pending:%' AS is_pending, wm.workspace_id, wm.role, w.slug
          FROM app_users u LEFT JOIN workspace_members wm ON wm.app_user_id=u.id
          LEFT JOIN workspaces w ON w.id=wm.workspace_id WHERE lower(u.email) IN (?,?) ORDER BY u.email,wm.id`, args: emails,
  })).rows;
  console.log('Destino:', actor.workspaceId, 'GeoModi; propietario:', owner.email);
  console.log('Membresías actuales:', JSON.stringify(await inspect()));
  if (process.argv.includes('--apply')) {
    for (const email of emails) console.log(await assignWorkspaceUser(db, actor, { email, role: 'admin', reassign: true }));
    const after = await inspect();
    for (const email of emails) {
      const memberships = after.filter(row => row.email.toLowerCase() === email);
      if (memberships.length !== 1 || Number(memberships[0].workspace_id) !== actor.workspaceId || memberships[0].role !== 'admin') throw new Error(`Verificación fallida: ${email}`);
    }
    const preservedOwner = (await db.execute({ sql: "SELECT wm.role,u.is_global_admin FROM workspace_members wm JOIN app_users u ON u.id=wm.app_user_id WHERE wm.workspace_id=? AND u.id=?", args: [actor.workspaceId, actor.appUserId] })).rows[0];
    if (preservedOwner?.role !== 'owner' || Number(preservedOwner.is_global_admin) !== 1) throw new Error('Verificación de propietario fallida');
    console.log('Verificado:', JSON.stringify(after));
  }
} finally { db.close(); }
