import { NextResponse } from 'next/server';
import { requireWorkspaceAdmin } from '@/lib/auth';
import { deleteIntegration } from '@/lib/integrationService';
import { buildAuthorizeUrl, encodeOAuthState, isOAuthConfigured } from '@/lib/zipnovaOAuth';

export async function POST(request) {
  try {
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    if (!isOAuthConfigured()) {
      return NextResponse.json(
        { error: 'OAuth de Zipnova no esta configurado en el servidor' },
        { status: 500 }
      );
    }

    const workspaceId = authResult.actor.workspaceId;
    const appUserId = authResult.actor.appUserId;
    if (!workspaceId) {
      return NextResponse.json({ error: 'No se pudo determinar el workspace' }, { status: 400 });
    }

    const state = encodeOAuthState({ workspaceId, appUserId });
    const authorizeUrl = buildAuthorizeUrl({ state });

    return NextResponse.json({ authorizeUrl });
  } catch (error) {
    console.error('Zipnova connect error:', error);
    return NextResponse.json({ error: error.message || 'Error al iniciar conexion con Zipnova' }, { status: 500 });
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

    await deleteIntegration({ workspaceId, provider: 'zipnova' });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Zipnova disconnect error:', error);
    return NextResponse.json({ error: error.message || 'Error al desconectar Zipnova' }, { status: 500 });
  }
}
