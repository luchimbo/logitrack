import crypto from 'crypto';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export async function createMercadoLibreInvite({ workspaceId, createdBy = null }) {
  await ensureDb();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  await db.execute({
    sql: `INSERT INTO mercadolibre_invites (workspace_id, token, created_by, expires_at) VALUES (?, ?, ?, ?)`,
    args: [workspaceId, token, createdBy, expiresAt],
  });
  return { token, expiresAt };
}

export async function validateMercadoLibreInvite(token) {
  await ensureDb();
  if (!token) throw new Error('Token inválido');
  const result = await db.execute({
    sql: `SELECT * FROM mercadolibre_invites WHERE token = ? AND expires_at > CURRENT_TIMESTAMP LIMIT 1`,
    args: [String(token)],
  });
  if (!result.rows.length) throw new Error('El link de invitación es inválido o ya expiró');
  return result.rows[0];
}

export async function markMercadoLibreInviteUsed(token) {
  await ensureDb();
  await db.execute({
    sql: `UPDATE mercadolibre_invites SET used_at = CURRENT_TIMESTAMP WHERE token = ? AND used_at IS NULL`,
    args: [String(token)],
  }).catch(() => {});
}
