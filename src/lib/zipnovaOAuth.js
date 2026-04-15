import { encrypt, decrypt } from '@/lib/cryptoUtils';

const ZIPNOVA_OAUTH_BASE_URL = process.env.ZIPNOVA_OAUTH_BASE_URL || 'https://api.zipnova.com.ar';
const ZIPNOVA_OAUTH_CLIENT_ID = process.env.ZIPNOVA_OAUTH_CLIENT_ID || '';
const ZIPNOVA_OAUTH_CLIENT_SECRET = process.env.ZIPNOVA_OAUTH_CLIENT_SECRET || '';
const ZIPNOVA_OAUTH_CALLBACK_URL = process.env.ZIPNOVA_OAUTH_CALLBACK_URL || '';

const SCOPES = 'shipments.show shipment_documentation.download accounts.show';

export function getOAuthConfig() {
  return {
    clientId: ZIPNOVA_OAUTH_CLIENT_ID,
    clientSecret: ZIPNOVA_OAUTH_CLIENT_SECRET,
    callbackUrl: ZIPNOVA_OAUTH_CALLBACK_URL,
    baseUrl: ZIPNOVA_OAUTH_BASE_URL,
  };
}

export function isOAuthConfigured() {
  return Boolean(ZIPNOVA_OAUTH_CLIENT_ID && ZIPNOVA_OAUTH_CLIENT_SECRET && ZIPNOVA_OAUTH_CALLBACK_URL);
}

export function buildAuthorizeUrl({ state }) {
  if (!isOAuthConfigured()) {
    throw new Error('Configuración OAuth de Zipnova incompleta');
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: ZIPNOVA_OAUTH_CLIENT_ID,
    redirect_uri: ZIPNOVA_OAUTH_CALLBACK_URL,
    scope: SCOPES,
    state,
  });
  return `${ZIPNOVA_OAUTH_BASE_URL}/oauth/authorize?${params.toString()}`;
}

export function encodeOAuthState({ workspaceId, appUserId }) {
  const payload = JSON.stringify({
    workspaceId,
    appUserId,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutos
  });
  return encrypt(payload);
}

export function decodeOAuthState(state) {
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

export async function exchangeCodeForToken({ code }) {
  if (!isOAuthConfigured()) {
    throw new Error('Configuración OAuth de Zipnova incompleta');
  }

  const res = await fetch(`${ZIPNOVA_OAUTH_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: ZIPNOVA_OAUTH_CLIENT_ID,
      client_secret: ZIPNOVA_OAUTH_CLIENT_SECRET,
      redirect_uri: ZIPNOVA_OAUTH_CALLBACK_URL,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Error al canjear el código de autorización');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
  };
}

export async function refreshAccessToken({ refreshToken }) {
  if (!isOAuthConfigured()) {
    throw new Error('Configuración OAuth de Zipnova incompleta');
  }

  const res = await fetch(`${ZIPNOVA_OAUTH_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: ZIPNOVA_OAUTH_CLIENT_ID,
      client_secret: ZIPNOVA_OAUTH_CLIENT_SECRET,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Error al refrescar el token');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
  };
}
