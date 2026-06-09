import { NextResponse } from 'next/server';
import { validateMercadoLibreInvite } from '@/lib/mercadolibreInvite';
import { buildMercadoLibreAuthorizeUrl, encodeMercadoLibreState, isMercadoLibreOAuthConfigured } from '@/lib/mercadolibreOAuth';

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://geomodi.ai').replace(/\/$/, '');

export async function GET(request, { params }) {
  const { token = '' } = await params;
  const errorRedirect = (msg) => NextResponse.redirect(`${BASE_URL}/connect/mercadolibre/${token}?error=${encodeURIComponent(msg)}`);

  try {
    if (!isMercadoLibreOAuthConfigured()) {
      return errorRedirect('OAuth de Mercado Libre no está configurado');
    }

    const invite = await validateMercadoLibreInvite(token);
    const state = encodeMercadoLibreState({
      workspaceId: invite.workspace_id,
      appUserId: null,
      isInvite: true,
      inviteToken: token,
    });

    return NextResponse.redirect(buildMercadoLibreAuthorizeUrl({ state }));
  } catch (error) {
    return errorRedirect(error.message || 'Link inválido o expirado');
  }
}
