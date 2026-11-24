import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { getIntegrationConnection } from '@/lib/integrationService';
import { createMercadoLibreClient } from '@/lib/mercadolibreClient';

export async function GET(request) {
  const authResult = await requireWorkspaceActor(request);
  if (authResult.error) return new NextResponse(null, { status: authResult.error.status });

  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get('item') || '';
  const connectionId = searchParams.get('connection') || '';
  if (!/^[A-Z]{3}\d{1,20}$/.test(itemId) || !/^\d{1,15}$/.test(connectionId)) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    const connection = await getIntegrationConnection({
      workspaceId: authResult.actor.workspaceId, provider: 'mercadolibre', id: connectionId, includeConfig: true,
    });
    if (!connection?.isActive || !connection.config?.accessToken) return new NextResponse(null, { status: 404 });

    const client = createMercadoLibreClient({ accessToken: connection.config.accessToken });
    const results = await client.getItems([itemId], 'id,secure_thumbnail,thumbnail');
    const item = results?.find(({ code, body }) => code === 200 && body?.id === itemId)?.body;
    if (!item?.secure_thumbnail && !item?.thumbnail) return new NextResponse(null, { status: 404 });
    const image = new URL(item.secure_thumbnail || item.thumbnail);
    if (!image.hostname.endsWith('.mlstatic.com')) return new NextResponse(null, { status: 404 });
    image.protocol = 'https:';
    return NextResponse.redirect(image, {
      status: 307,
      headers: { 'Cache-Control': 'private, max-age=3600' },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
