import { NextResponse } from 'next/server';
import { requireWorkspaceAdmin } from '@/lib/auth';
import { buildMercadoLibreAuthorizeUrl, encodeMercadoLibreState, isMercadoLibreOAuthConfigured } from '@/lib/mercadolibreOAuth';
import { deleteIntegrationConnection } from '@/lib/integrationService';

export async function POST(request) {
  try {
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) return NextResponse.json(authResult.error.body, { status: authResult.error.status });

    if (!isMercadoLibreOAuthConfigured()) {
      return NextResponse.json({ error: 'OAuth de Mercado Libre no esta configurado en el servidor' }, { status: 500 });
    }

    const state = encodeMercadoLibreState({ workspaceId: authResult.actor.workspaceId, appUserId: authResult.actor.appUserId });
    return NextResponse.json({ authorizeUrl: buildMercadoLibreAuthorizeUrl({ state }) });
  } catch (error) {
    console.error('Mercado Libre connect error:', error);
    return NextResponse.json({ error: error.message || 'Error al iniciar Mercado Libre' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) return NextResponse.json(authResult.error.body, { status: authResult.error.status });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('connection_id') || '';
    if (!id) return NextResponse.json({ error: 'connection_id es obligatorio' }, { status: 400 });

    await deleteIntegrationConnection({ workspaceId: authResult.actor.workspaceId, provider: 'mercadolibre', id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mercado Libre disconnect error:', error);
    return NextResponse.json({ error: error.message || 'Error al desconectar Mercado Libre' }, { status: 500 });
  }
}
