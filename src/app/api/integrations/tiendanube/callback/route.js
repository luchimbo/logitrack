import { NextResponse } from 'next/server';
import { exchangeTiendanubeCodeForToken } from '@/lib/tiendanubeOAuth';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';

const BASE_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://geomodi.ai';

async function saveOauthSession({ storeId, accessToken, scope }) {
  await ensureDb();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutos
  await db.execute({
    sql: `INSERT INTO tiendanube_oauth_sessions (store_id, access_token, scope, expires_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(store_id) DO UPDATE SET
            access_token = excluded.access_token,
            scope = excluded.scope,
            expires_at = excluded.expires_at,
            created_at = CURRENT_TIMESTAMP`,
    args: [storeId, accessToken, scope || '', expiresAt],
  });
}

export async function GET(request) {
  let baseRedirect = `${BASE_APP_URL}/?tab=tiendanube`;

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

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

    return NextResponse.redirect(`${baseRedirect}&tiendanube_store_id=${encodeURIComponent(tokens.storeId)}`);
  } catch (err) {
    console.error('Tiendanube OAuth callback error:', err);
    return NextResponse.redirect(`${baseRedirect}&tiendanube_error=${encodeURIComponent(err.message || 'Error en la autorizacion')}`);
  }
}
