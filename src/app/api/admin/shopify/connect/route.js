import { NextResponse } from 'next/server';
import { requireWorkspaceAdmin } from '@/lib/auth';
import { buildShopifyAuthorizeUrl, encodeShopifyState, isShopifyOAuthConfigured, normalizeShopifyShop } from '@/lib/shopifyOAuth';
import { deleteIntegrationConnection } from '@/lib/integrationService';

export async function POST(request) {
  try {
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }
    if (!isShopifyOAuthConfigured()) {
      return NextResponse.json({ error: 'OAuth de Shopify no está configurado en el servidor' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const shop = normalizeShopifyShop(body?.shop);
    const state = encodeShopifyState({ workspaceId: authResult.actor.workspaceId, appUserId: authResult.actor.appUserId });
    const authorizeUrl = buildShopifyAuthorizeUrl({ shop, state });
    return NextResponse.json({ authorizeUrl, shop });
  } catch (error) {
    console.error('Shopify connect error:', error);
    return NextResponse.json({ error: error.message || 'Error al iniciar conexión con Shopify' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('connection_id') || '';
    if (!id) return NextResponse.json({ error: 'connection_id es obligatorio' }, { status: 400 });
    await deleteIntegrationConnection({ workspaceId: authResult.actor.workspaceId, provider: 'shopify', id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Shopify disconnect error:', error);
    return NextResponse.json({ error: error.message || 'Error al desconectar Shopify' }, { status: 500 });
  }
}
