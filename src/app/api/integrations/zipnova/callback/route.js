import { NextResponse } from 'next/server';
import { decodeOAuthState, exchangeCodeForToken } from '@/lib/zipnovaOAuth';
import { saveIntegration } from '@/lib/integrationService';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    const baseRedirect = `${process.env.NEXT_PUBLIC_APP_URL || ''}/?tab=zipnova`;

    if (error) {
      return NextResponse.redirect(`${baseRedirect}&zipnova_error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${baseRedirect}&zipnova_error=${encodeURIComponent('Faltan parametros de autorizacion')}`);
    }

    const stateData = decodeOAuthState(state);
    const workspaceId = stateData.workspaceId;

    const tokens = await exchangeCodeForToken({ code });

    await saveIntegration({
      workspaceId,
      provider: 'zipnova',
      config: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        tokenType: tokens.tokenType,
      },
    });

    return NextResponse.redirect(`${baseRedirect}&zipnova_connected=1`);
  } catch (err) {
    console.error('Zipnova OAuth callback error:', err);
    const baseRedirect = `${process.env.NEXT_PUBLIC_APP_URL || ''}/?tab=zipnova`;
    return NextResponse.redirect(`${baseRedirect}&zipnova_error=${encodeURIComponent(err.message || 'Error en la autorizacion')}`);
  }
}
