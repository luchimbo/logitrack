import { NextResponse } from 'next/server';
import { requireWorkspaceAdmin } from '@/lib/auth';
import { deleteIntegration } from '@/lib/integrationService';
import { buildTiendanubeAuthorizeUrl, encodeTiendanubeState, isTiendanubeOAuthConfigured } from '@/lib/tiendanubeOAuth';

export async function POST(request) {
  try {
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    if (!isTiendanubeOAuthConfigured()) {
      return NextResponse.json(
        { error: 'OAuth de Tiendanube no esta configurado en el servidor' },
        { status: 500 }
      );
    }

    const workspaceId = authResult.actor.workspaceId;
    const appUserId = authResult.actor.appUserId;
    if (!workspaceId) {
      return NextResponse.json({ error: 'No se pudo determinar el workspace' }, { status: 400 });
    }

    const state = encodeTiendanubeState({ workspaceId, appUserId });
    const authorizeUrl = buildTiendanubeAuthorizeUrl({ state });

    const response = NextResponse.json({ authorizeUrl });
    response.cookies.set('tiendanube_oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 10,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Tiendanube connect error:', error);
    return NextResponse.json({ error: error.message || 'Error al iniciar conexion con Tiendanube' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const workspaceId = authResult.actor.workspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: 'No se pudo determinar el workspace' }, { status: 400 });
    }

    await deleteIntegration({ workspaceId, provider: 'tiendanube' });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Tiendanube disconnect error:', error);
    return NextResponse.json({ error: error.message || 'Error al desconectar Tiendanube' }, { status: 500 });
  }
}
