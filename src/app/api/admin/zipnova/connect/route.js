import { NextResponse } from 'next/server';
import { requireWorkspaceAdmin } from '@/lib/auth';
import { createZipnovaClient } from '@/lib/zipnovaClient';
import { saveIntegration, deleteIntegration } from '@/lib/integrationService';

export async function POST(request) {
  try {
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const body = await request.json();
    const token = String(body?.token || '').trim();
    const secret = String(body?.secret || '').trim();
    const baseUrl = String(body?.baseUrl || '').trim() || undefined;

    if (!token || !secret) {
      return NextResponse.json({ error: 'Token y secret son obligatorios' }, { status: 400 });
    }

    // Validar credenciales contra Zipnova
    const testClient = createZipnovaClient({ token, secret, baseUrl });
    try {
      await testClient.listShipments({ page: 1 });
    } catch (err) {
      return NextResponse.json(
        { error: 'Las credenciales no son válidas o Zipnova no respondió' },
        { status: 400 }
      );
    }

    const workspaceId = authResult.actor.workspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: 'No se pudo determinar el workspace' }, { status: 400 });
    }

    await saveIntegration({
      workspaceId,
      provider: 'zipnova',
      config: { token, secret, baseUrl },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Zipnova connect error:', error);
    return NextResponse.json({ error: error.message || 'Error al conectar Zipnova' }, { status: 500 });
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
