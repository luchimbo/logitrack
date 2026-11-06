import { NextResponse } from 'next/server';
import { decodeTiendanubeState, exchangeTiendanubeCodeForToken } from '@/lib/tiendanubeOAuth';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';

const BASE_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://geomodi.ai';

async function saveOauthSession({ storeId, accessToken, scope }) {
  await ensureDb();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutos
  // SQLite en Turso no soporta ON CONFLICT sin UNIQUE constraint explícito
  await db.execute({
    sql: `DELETE FROM tiendanube_oauth_sessions WHERE store_id = ?`,
    args: [storeId],
  });
  await db.execute({
    sql: `INSERT INTO tiendanube_oauth_sessions (store_id, access_token, scope, expires_at)
          VALUES (?, ?, ?, ?)`,
    args: [storeId, accessToken, scope || '', expiresAt],
  });
}

export async function GET(request) {
  let appRedirectPath = `/app?tab=tiendanube`;
  let baseRedirect = `${BASE_APP_URL}${appRedirectPath}`;

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const state = searchParams.get('state');

    if (state) {
      decodeTiendanubeState(state);
    }

    if (error) {
      return NextResponse.redirect(`${baseRedirect}&tiendanube_error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return NextResponse.redirect(`${baseRedirect}&tiendanube_error=${encodeURIComponent('Falta el codigo de autorizacion')}`);
    }

    const tokens = await exchangeTiendanubeCodeForToken({ code });

    await saveOauthSession({
      storeId: tokens.storeId,
      accessToken: tokens.accessToken,
      scope: tokens.scope,
    });

    const installPath = `${appRedirectPath}&tiendanube_store_id=${encodeURIComponent(tokens.storeId)}`;
    const installUrl = `${BASE_APP_URL}${installPath}`;
    const loginUrl = `${BASE_APP_URL}/login?redirect_url=${encodeURIComponent(installPath)}`;

    return NextResponse.redirect(state ? installUrl : loginUrl);
  } catch (err) {
    console.error('Tiendanube OAuth callback error:', err);
    return NextResponse.redirect(`${BASE_APP_URL}/login?redirect_url=${encodeURIComponent(`${appRedirectPath}&tiendanube_error=${encodeURIComponent(err.message || 'Error en la autorizacion')}`)}`);
  }
}
