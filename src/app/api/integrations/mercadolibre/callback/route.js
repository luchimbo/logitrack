import { NextResponse } from 'next/server';
import { decodeMercadoLibreState, exchangeMercadoLibreCodeForToken } from '@/lib/mercadolibreOAuth';
import { saveIntegrationConnection } from '@/lib/integrationService';
import { createMercadoLibreClient } from '@/lib/mercadolibreClient';
import { markMercadoLibreInviteUsed } from '@/lib/mercadolibreInvite';

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://geomodi.ai').replace(/\/$/, '');

function tryDecodeState(state) {
  try { return decodeMercadoLibreState(state); } catch { return null; }
}

export async function GET(request) {
  const appRedirect = `${BASE_URL}/app?tab=mercadolibre`;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const stateData = state ? tryDecodeState(state) : null;
  const isInvite = stateData?.isInvite || false;
  const inviteToken = stateData?.inviteToken || '';
  const successBase = isInvite ? `${BASE_URL}/connect/mercadolibre/success` : appRedirect;

  const errorRedirect = (msg) => NextResponse.redirect(
    isInvite ? `${successBase}?error=${encodeURIComponent(msg)}` : `${appRedirect}&meli_error=${encodeURIComponent(msg)}`
  );

  try {
    if (error) return errorRedirect(error);
    if (!code || !state) return errorRedirect('Faltan parametros de autorizacion');

    const stateDecoded = decodeMercadoLibreState(state);
    const tokens = await exchangeMercadoLibreCodeForToken({ code });
    const client = createMercadoLibreClient({ accessToken: tokens.accessToken });
    const me = await client.getMe();
    const externalStoreId = String(me?.id || tokens.userId || '');
    if (!externalStoreId) throw new Error('No se pudo resolver el usuario de Mercado Libre');

    await saveIntegrationConnection({
      workspaceId: stateDecoded.workspaceId,
      provider: 'mercadolibre',
      externalStoreId,
      displayName: me?.nickname || `Mercado Libre ${externalStoreId}`,
      config: { ...tokens, userId: externalStoreId, nickname: me?.nickname || '', siteId: me?.site_id || 'MLA' },
    });

    if (isInvite && inviteToken) await markMercadoLibreInviteUsed(inviteToken);

    if (isInvite) {
      return NextResponse.redirect(`${successBase}?nickname=${encodeURIComponent(me?.nickname || externalStoreId)}`);
    }
    return NextResponse.redirect(`${appRedirect}&meli_connected=1`);
  } catch (error) {
    console.error('Mercado Libre callback error:', error);
    return errorRedirect(error.message || 'Error en autorizacion Mercado Libre');
  }
}
