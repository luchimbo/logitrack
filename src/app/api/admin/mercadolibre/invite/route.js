import { NextResponse } from 'next/server';
import { requireWorkspaceAdmin } from '@/lib/auth';
import { createMercadoLibreInvite } from '@/lib/mercadolibreInvite';
import { isMercadoLibreOAuthConfigured } from '@/lib/mercadolibreOAuth';

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://geomodi.ai').replace(/\/$/, '');

export async function POST(request) {
  try {
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) return NextResponse.json(authResult.error.body, { status: authResult.error.status });

    if (!isMercadoLibreOAuthConfigured()) {
      return NextResponse.json({ error: 'OAuth de Mercado Libre no está configurado en el servidor' }, { status: 500 });
    }

    const { token, expiresAt } = await createMercadoLibreInvite({
      workspaceId: authResult.actor.workspaceId,
      createdBy: authResult.actor.appUserId || null,
    });

    return NextResponse.json({
      token,
      expiresAt,
      inviteUrl: `${BASE_URL}/connect/mercadolibre/${token}`,
      expiresInHours: 72,
    });
  } catch (error) {
    console.error('Mercado Libre invite error:', error);
    return NextResponse.json({ error: error.message || 'Error al generar link de invitación' }, { status: 500 });
  }
}
