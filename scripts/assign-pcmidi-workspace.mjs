import { execFileSync, spawn } from 'node:child_process';
import { connect } from 'node:net';
import { setTimeout } from 'node:timers/promises';
import { createClient } from '@libsql/client';
import { assignWorkspaceUser } from '../src/lib/workspaceMembership.js';

// Read-only by default. --apply performs the user-requested assignments using
// the same transaction and audit logic as the authenticated API.
// The old *_PROD environment variables point to an obsolete Turso snapshot.
// Use the current libSQL service through SSH; never print or persist its JWT.
const tunnel = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-N', '-L', '127.0.0.1:18088:127.0.0.1:8088', 'pcmidi'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
let tunnelError = '';
tunnel.stderr.on('data', data => { tunnelError += data.toString(); });
const authToken = execFileSync('ssh', ['-o', 'BatchMode=yes', 'pcmidi', 'cat services/geomodi-libsql/keys/app-rw.jwt'], { encoding: 'utf8', windowsHide: true }).trim();
let ready = false;
for (let attempt = 0; attempt < 40 && !ready; attempt++) {
  if (tunnel.exitCode !== null) throw new Error(`No se pudo abrir el t˙nel SSH: ${tunnelError}`);
  ready = await new Promise(resolve => {
    const socket = connect({ host: '127.0.0.1', port: 18088 });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
  });
  if (!ready) await setTimeout(100);
}
if (!ready) { tunnel.kill(); throw new Error('El t˙nel SSH no est· disponible'); }
const db = createClient({ url: 'http://127.0.0.1:18088', authToken });
const emails = ['luciopcmidi@gmail.com', 'guillermo@pcmidicenter.com'];
try {
  const owners = (await db.execute({
    sql: `SELECT u.id, u.email, u.is_global_admin, wm.workspace_id, wm.role
          FROM app_users u JOIN workspace_members wm ON wm.app_user_id=u.id
          JOIN workspaces w ON w.id=wm.workspace_id
          WHERE lower(u.email)=? AND w.slug='legacy' AND wm.role='owner'`,
    args: ['camilopcmidi@gmail.com'],
  })).rows;
  if (owners.length !== 1 || Number(owners[0].is_global_admin) !== 1) throw new Error('No se pudo identificar inequ√≠vocamente el espacio de Camilo');
  const owner = owners[0];
  const actor = { appUserId: Number(owner.id), workspaceId: Number(owner.workspace_id), email: owner.email, role: 'owner', isGlobalAdmin: true, authType: 'maintenance' };
  const inspect = async () => (await db.execute({
    sql: `SELECT u.email, u.clerk_user_id LIKE 'pending:%' AS is_pending, wm.workspace_id, wm.role, w.slug
          FROM app_users u LEFT JOIN workspace_members wm ON wm.app_user_id=u.id
          LEFT JOIN workspaces w ON w.id=wm.workspace_id WHERE lower(u.email) IN (?,?) ORDER BY u.email,wm.id`, args: emails,
  })).rows;
  console.log('Destino:', actor.workspaceId, 'GeoModi; propietario:', owner.email);
  console.log('Membres√≠as actuales:', JSON.stringify(await inspect()));
  if (process.argv.includes('--apply')) {
    for (const email of emails) console.log(await assignWorkspaceUser(db, actor, { email, role: 'admin', reassign: true }));
    const after = await inspect();
    for (const email of emails) {
      const memberships = after.filter(row => row.email.toLowerCase() === email);
      if (memberships.length !== 1 || Number(memberships[0].workspace_id) !== actor.workspaceId || memberships[0].role !== 'admin') throw new Error(`Verificaci√≥n fallida: ${email}`);
    }
    const preservedOwner = (await db.execute({ sql: "SELECT wm.role,u.is_global_admin FROM workspace_members wm JOIN app_users u ON u.id=wm.app_user_id WHERE wm.workspace_id=? AND u.id=?", args: [actor.workspaceId, actor.appUserId] })).rows[0];
    if (preservedOwner?.role !== 'owner' || Number(preservedOwner.is_global_admin) !== 1) throw new Error('Verificaci√≥n de propietario fallida');
    console.log('Verificado:', JSON.stringify(after));
  }
} finally { db.close(); tunnel.kill(); }
