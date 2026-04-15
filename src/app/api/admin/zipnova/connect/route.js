import { NextResponse } from 'next/server';
import { requireWorkspaceAdmin } from '@/lib/auth';
import { deleteIntegration, saveIntegration } from '@/lib/integrationService';
import { createZipnovaClient } from '@/lib/zipnovaClient';
import { buildAuthorizeUrl, encodeOAuthState, isOAuthConfigured } from '@/lib/zipnovaOAuth';

export async function POST(request) {
  try {
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const body = await request.json().catch(() => ({}));
    const token = String(body?.token || '').trim();
    const secret = String(body?.secret || '').trim();
    const baseUrl = String(body?.baseUrl || '').trim() || undefined;

    // Si el usuario envia token/secret, usamos conexion manual (Basic Auth)
    if (token && secret) {
      const testClient = createZipnovaClient({ token, secret, baseUrl });
      try {
        await testClient.listShipments({ page: 1 });
      } catch (err) {
        return NextResponse.json(
          { error: 'Las credenciales no son validas o Zipnova no respondio' },
          { status: 400 }
        );
      }

      const workspaceId = authResult.actor.workspaceId;
      await saveIntegration({
        workspaceId,
        provider: 'zipnova',
        config: { token, secret, baseUrl },
      });

      return NextResponse.json({ success: true });
    }

    // Si no hay OAuth configurado, informamos al frontend para que muestre el formulario manual
    if (!isOAuthConfigured()) {
      return NextResponse.json(
        { oauthConfigured: false, error: 'OAuth de Zipnova no esta configurado. Ingresa las credenciales manuales.' },
        { status: 400 }
      );
    }

    const workspaceId = authResult.actor.workspaceId;
    const appUserId = authResult.actor.appUserId;
    if (!workspaceId) {
      return NextResponse.json({ error: 'No se pudo determinar el workspace' }, { status: 400 });
    }

    const state = encodeOAuthState({ workspaceId, appUserId });
    const authorizeUrl = buildAuthorizeUrl({ state });

    return NextResponse.json({ oauthConfigured: true, authorizeUrl });
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
