import { encrypt, decrypt } from '@/lib/cryptoUtils';

const TIENDANUBE_APP_ID = process.env.TIENDANUBE_APP_ID || '';
const TIENDANUBE_CLIENT_SECRET = process.env.TIENDANUBE_CLIENT_SECRET || '';
const TIENDANUBE_CALLBACK_URL = process.env.TIENDANUBE_CALLBACK_URL || '';

export function getTiendanubeOAuthConfig() {
  return {
    appId: TIENDANUBE_APP_ID,
    clientSecret: TIENDANUBE_CLIENT_SECRET,
    callbackUrl: TIENDANUBE_CALLBACK_URL,
  };
}

export function isTiendanubeOAuthConfigured() {
  return Boolean(TIENDANUBE_APP_ID && TIENDANUBE_CLIENT_SECRET && TIENDANUBE_CALLBACK_URL);
}

export function buildTiendanubeAuthorizeUrl({ state }) {
  if (!isTiendanubeOAuthConfigured()) {
    throw new Error('Configuración OAuth de Tiendanube incompleta');
  }
  return `https://www.tiendanube.com/apps/${TIENDANUBE_APP_ID}/authorize`;
}

export function encodeTiendanubeState({ workspaceId, appUserId }) {
  const payload = JSON.stringify({
    workspaceId,
    appUserId,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutos
  });
  return encrypt(payload);
}

export function decodeTiendanubeState(state) {
  try {
    const decrypted = decrypt(state);
    const data = JSON.parse(decrypted);
    if (!data.workspaceId || !data.appUserId || !data.expiresAt) {
      throw new Error('State inválido');
    }
    if (Date.now() > data.expiresAt) {
      throw new Error('State expirado');
    }
    return data;
  } catch (e) {
    throw new Error('State inválido o expirado');
  }
}

export async function exchangeTiendanubeCodeForToken({ code }) {
  if (!isTiendanubeOAuthConfigured()) {
    throw new Error('Configuración OAuth de Tiendanube incompleta');
  }

  const res = await fetch('https://www.tiendanube.com/apps/authorize/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: TIENDANUBE_APP_ID,
      client_secret: TIENDANUBE_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Error al canjear el código de autorización');
  }

  return {
    accessToken: data.access_token,
    tokenType: data.token_type,
    scope: data.scope,
    storeId: String(data.user_id || ''),
  };
}
