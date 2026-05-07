import { NextResponse } from 'next/server';
import { requireWorkspaceAdmin } from '@/lib/auth';
import { deleteIntegration, saveIntegration } from '@/lib/integrationService';
import { createCorreoArgentinoClient } from '@/lib/correoArgentinoClient';

export async function POST(request) {
  try {
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const body = await request.json().catch(() => ({}));
    const config = {
      apiKey: String(body?.apiKey || '').trim(),
      agreement: String(body?.agreement || '').trim(),
      sellerId: String(body?.sellerId || body?.agreement || '').trim(),
      baseUrl: String(body?.baseUrl || '').trim() || undefined,
    };

    if (!config.apiKey || !config.agreement) {
      return NextResponse.json({ error: 'Ingresá API key y agreement de PAQ.AR' }, { status: 400 });
    }

    const client = createCorreoArgentinoClient(config);
    try {
      await client.validateCredentials();
    } catch (error) {
      return NextResponse.json(
        { error: error.message || 'Las credenciales no son válidas o PAQ.AR no respondió' },
        { status: 400 }
      );
    }

    await saveIntegration({
      workspaceId: authResult.actor.workspaceId,
      provider: 'correo_argentino',
      config,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Correo Argentino connect error:', error);
    return NextResponse.json({ error: error.message || 'Error al conectar Correo Argentino' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    await deleteIntegration({ workspaceId: authResult.actor.workspaceId, provider: 'correo_argentino' });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Correo Argentino disconnect error:', error);
    return NextResponse.json({ error: error.message || 'Error al desconectar Correo Argentino' }, { status: 500 });
  }
}
