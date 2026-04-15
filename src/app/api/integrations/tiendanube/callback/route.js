import { NextResponse } from 'next/server';
import { decodeTiendanubeState, exchangeTiendanubeCodeForToken } from '@/lib/tiendanubeOAuth';
import { saveIntegration } from '@/lib/integrationService';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    const baseRedirect = `${process.env.NEXT_PUBLIC_APP_URL || ''}/?tab=tiendanube`;

    if (error) {
      return NextResponse.redirect(`${baseRedirect}&tiendanube_error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${baseRedirect}&tiendanube_error=${encodeURIComponent('Faltan parametros de autorizacion')}`);
    }

    const stateData = decodeTiendanubeState(state);
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

    return NextResponse.redirect(`${baseRedirect}&tiendanube_connected=1`);
  } catch (err) {
    console.error('Tiendanube OAuth callback error:', err);
    const baseRedirect = `${process.env.NEXT_PUBLIC_APP_URL || ''}/?tab=tiendanube`;
    return NextResponse.redirect(`${baseRedirect}&tiendanube_error=${encodeURIComponent(err.message || 'Error en la autorizacion')}`);
  }
}
