import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decodeTiendanubeState, exchangeTiendanubeCodeForToken } from '@/lib/tiendanubeOAuth';
import { saveIntegration } from '@/lib/integrationService';

const BASE_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://geomodi.ai';

export async function GET(request) {
  let baseRedirect = `${BASE_APP_URL}/?tab=tiendanube`;

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(`${baseRedirect}&tiendanube_error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return NextResponse.redirect(`${baseRedirect}&tiendanube_error=${encodeURIComponent('Falta el codigo de autorizacion')}`);
    }

    // Tiendanube a veces no devuelve state; usamos cookie como fallback
    let effectiveState = state;
    if (!effectiveState) {
      const cookieStore = await cookies();
      effectiveState = cookieStore.get('tiendanube_oauth_state')?.value || null;
    }

    if (!effectiveState) {
      return NextResponse.redirect(`${baseRedirect}&tiendanube_error=${encodeURIComponent('No se encontro el estado de autorizacion')}`);
    }

    const stateData = decodeTiendanubeState(effectiveState);
    const workspaceId = stateData.workspaceId;

    const tokens = await exchangeTiendanubeCodeForToken({ code });

    await saveIntegration({
      workspaceId,
      provider: 'tiendanube',
      config: {
        accessToken: tokens.accessToken,
        tokenType: tokens.tokenType,
        scope: tokens.scope,
        storeId: tokens.storeId,
      },
    });

    const response = NextResponse.redirect(`${baseRedirect}&tiendanube_connected=1`);
    response.cookies.set('tiendanube_oauth_state', '', { maxAge: 0, path: '/' });
    return response;
  } catch (err) {
    console.error('Tiendanube OAuth callback error:', err);
    return NextResponse.redirect(`${baseRedirect}&tiendanube_error=${encodeURIComponent(err.message || 'Error en la autorizacion')}`);
  }
}
