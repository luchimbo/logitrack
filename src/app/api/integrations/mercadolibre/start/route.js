import { NextResponse } from 'next/server';
import { requireWorkspaceAdmin } from '@/lib/auth';
import { buildMercadoLibreAuthorizeUrl, encodeMercadoLibreState, isMercadoLibreOAuthConfigured } from '@/lib/mercadolibreOAuth';

const BASE_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://geomodi.ai';

export async function GET(request) {
  const baseRedirect = `${BASE_APP_URL.replace(/\/$/, '')}/app?tab=mercadolibre`;

  try {
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.redirect(`${baseRedirect}&meli_error=${encodeURIComponent('Inicia sesion como admin para conectar Mercado Libre')}`);
    }

    if (!isMercadoLibreOAuthConfigured()) {
      return NextResponse.redirect(`${baseRedirect}&meli_error=${encodeURIComponent('OAuth de Mercado Libre no esta configurado en el servidor')}`);
    }

    const state = encodeMercadoLibreState({
      workspaceId: authResult.actor.workspaceId,
      appUserId: authResult.actor.appUserId,
    });

    return NextResponse.redirect(buildMercadoLibreAuthorizeUrl({ state }));
  } catch (error) {
    console.error('Mercado Libre start error:', error);
    return NextResponse.redirect(`${baseRedirect}&meli_error=${encodeURIComponent(error.message || 'Error al iniciar Mercado Libre')}`);
  }
}
