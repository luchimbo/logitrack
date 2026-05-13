import { NextResponse } from 'next/server';
import { decodeMercadoLibreState, exchangeMercadoLibreCodeForToken } from '@/lib/mercadolibreOAuth';
import { saveIntegrationConnection } from '@/lib/integrationService';
import { createMercadoLibreClient } from '@/lib/mercadolibreClient';

const BASE_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://geomodi.ai';

export async function GET(request) {
  const baseRedirect = `${BASE_APP_URL.replace(/\/$/, '')}/app?tab=mercadolibre`;
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) return NextResponse.redirect(`${baseRedirect}&meli_error=${encodeURIComponent(error)}`);
    if (!code || !state) return NextResponse.redirect(`${baseRedirect}&meli_error=${encodeURIComponent('Faltan parametros de autorizacion')}`);

    const stateData = decodeMercadoLibreState(state);
    const tokens = await exchangeMercadoLibreCodeForToken({ code });
    const client = createMercadoLibreClient({ accessToken: tokens.accessToken });
    const me = await client.getMe();
    const externalStoreId = String(me?.id || tokens.userId || '');
    if (!externalStoreId) throw new Error('No se pudo resolver el usuario de Mercado Libre');

    const connectionId = await saveIntegrationConnection({
      workspaceId: stateData.workspaceId,
      provider: 'mercadolibre',
      externalStoreId,
      displayName: me?.nickname || `Mercado Libre ${externalStoreId}`,
      config: {
        ...tokens,
        userId: externalStoreId,
        nickname: me?.nickname || '',
        siteId: me?.site_id || 'MLA',
      },
    });

    return NextResponse.redirect(`${baseRedirect}&meli_connected=1&meli_connection_id=${encodeURIComponent(connectionId)}`);
  } catch (error) {
    console.error('Mercado Libre callback error:', error);
    return NextResponse.redirect(`${baseRedirect}&meli_error=${encodeURIComponent(error.message || 'Error en autorizacion Mercado Libre')}`);
  }
}
