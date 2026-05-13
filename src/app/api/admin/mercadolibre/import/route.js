import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { importMercadoLibreLabel } from '@/lib/mercadolibreStore';

export async function POST(request) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) return NextResponse.json(authResult.error.body, { status: authResult.error.status });

    const body = await request.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();
    const connectionId = String(body?.connectionId || '').trim();
    if (!orderId || !connectionId) return NextResponse.json({ error: 'orderId y connectionId son obligatorios' }, { status: 400 });

    const workspaceId = authResult.actor.workspaceId;
    const targets = await listMercadoLibreClientTargets(workspaceId, { connectionId });
    if (!targets.length) throw new Error('Conexion Mercado Libre no disponible');

    const imported = await importMercadoLibreLabel({ workspaceId, client: targets[0].client, orderId, connectionId });
    return NextResponse.json({ success: true, ...imported });
  } catch (error) {
    console.error('Mercado Libre import error:', error);
    return NextResponse.json({ error: error.message || 'Error al importar etiqueta Mercado Libre' }, { status: 500 });
  }
}
