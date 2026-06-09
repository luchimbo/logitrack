import { encrypt, decrypt } from '@/lib/cryptoUtils';

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export function createMercadoLibreInvite({ workspaceId }) {
  const expiresAt = Date.now() + INVITE_TTL_MS;
  const token = encrypt(JSON.stringify({ workspaceId, expiresAt, v: 1 }));
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}

export function validateMercadoLibreInvite(token) {
  if (!token) throw new Error('Token inválido');
  let data;
  try {
    data = JSON.parse(decrypt(String(token).replace(/ /g, '+')));
  } catch {
    throw new Error('El link de invitación es inválido o ya expiró');
  }
  if (!data.workspaceId || !data.expiresAt) throw new Error('El link de invitación es inválido');
  if (Date.now() > data.expiresAt) throw new Error('El link de invitación ya expiró');
  return { workspace_id: data.workspaceId, expires_at: new Date(data.expiresAt).toISOString() };
}

export function markMercadoLibreInviteUsed() {
  // no-op: self-contained tokens don't need DB tracking
}
