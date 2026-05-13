import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';
import { getArgentinaDateString } from '@/lib/dateUtils';

function normalizeIds(ids) {
  return Array.isArray(ids)
    ? [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
    : [];
}

export async function POST(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const { ids } = await request.json().catch(() => ({}));
    const normalizedIds = normalizeIds(ids);

    if (!normalizedIds.length) {
      return NextResponse.json({ error: 'No hay etiquetas seleccionadas' }, { status: 400 });
    }

    if (normalizedIds.length > 500) {
      return NextResponse.json({ error: 'Maximo 500 etiquetas por descarga' }, { status: 400 });
    }

    const placeholders = normalizedIds.map(() => '?').join(', ');
    const result = await db.execute({
      sql: `SELECT id, raw_zpl FROM shipments WHERE workspace_id = ? AND id IN (${placeholders})`,
      args: [authResult.actor.workspaceId, ...normalizedIds],
    });

    const byId = new Map(result.rows.map((row) => [Number(row.id), row]));
    const missingIds = normalizedIds.filter((id) => !byId.has(id));
    if (missingIds.length) {
      return NextResponse.json({ error: 'Algunas etiquetas no pertenecen a este workspace o no existen' }, { status: 404 });
    }

    const withoutLabel = normalizedIds.filter((id) => !String(byId.get(id)?.raw_zpl || '').trim());
    if (withoutLabel.length) {
      return NextResponse.json({ error: `Hay ${withoutLabel.length} etiqueta(s) sin ZPL disponible` }, { status: 422 });
    }

    const zpl = normalizedIds
      .map((id) => String(byId.get(id).raw_zpl).trim())
      .join('\r\n');

    return new NextResponse(zpl, {
      headers: {
        'Content-Type': 'application/vnd.zebra-zpl',
        'Content-Disposition': `attachment; filename="etiquetas-${getArgentinaDateString()}.zpl"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Bulk labels download error:', error);
    return NextResponse.json({ error: 'Error al descargar etiquetas' }, { status: 500 });
  }
}
