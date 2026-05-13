import { encrypt, decrypt } from '@/lib/cryptoUtils';

const MELI_CLIENT_ID = process.env.MERCADOLIBRE_CLIENT_ID || '';
const MELI_CLIENT_SECRET = process.env.MERCADOLIBRE_CLIENT_SECRET || '';
const MELI_CALLBACK_URL = process.env.MERCADOLIBRE_CALLBACK_URL || '';

export function isMercadoLibreOAuthConfigured() {
  return Boolean(MELI_CLIENT_ID && MELI_CLIENT_SECRET && MELI_CALLBACK_URL);
}

export function encodeMercadoLibreState({ workspaceId, appUserId }) {
  return encrypt(JSON.stringify({
    workspaceId,
    appUserId,
    expiresAt: Date.now() + 10 * 60 * 1000,
  }));
}

export function decodeMercadoLibreState(state) {
  try {
    const normalizedState = String(state || '').replace(/ /g, '+');
    const data = JSON.parse(decrypt(normalizedState));
    if (!data.workspaceId || !data.expiresAt) throw new Error('State invalido');
    if (Date.now() > data.expiresAt) throw new Error('State expirado');
    return data;
  } catch {
    throw new Error('State invalido o expirado');
  }
}

export function buildMercadoLibreAuthorizeUrl({ state }) {
  if (!isMercadoLibreOAuthConfigured()) {
    throw new Error('OAuth de Mercado Libre no esta configurado en el servidor');
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: MELI_CLIENT_ID,
    redirect_uri: MELI_CALLBACK_URL,
    state,
  });
  return `https://auth.mercadolibre.com.ar/authorization?${params.toString()}`;
}

async function tokenRequest(body) {
  if (!isMercadoLibreOAuthConfigured()) {
    throw new Error('OAuth de Mercado Libre no esta configurado en el servidor');
  }

  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.message || data.error || 'Error de autorizacion Mercado Libre');
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type,
    scope: data.scope,
    userId: String(data.user_id || ''),
    expiresAt: new Date(Date.now() + (Number(data.expires_in || 0) * 1000)).toISOString(),
  };
}

export function exchangeMercadoLibreCodeForToken({ code }) {
  return tokenRequest({
    grant_type: 'authorization_code',
    client_id: MELI_CLIENT_ID,
    client_secret: MELI_CLIENT_SECRET,
    code,
    redirect_uri: MELI_CALLBACK_URL,
  });
}

export function refreshMercadoLibreToken({ refreshToken }) {
  return tokenRequest({
    grant_type: 'refresh_token',
    client_id: MELI_CLIENT_ID,
    client_secret: MELI_CLIENT_SECRET,
    refresh_token: refreshToken,
  });
}
