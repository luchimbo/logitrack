import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';
import { extractLabelDimensionsInches } from '@/lib/labelDimensions';
import { normalizePrintQueueIds } from '@/lib/printQueue';

async function buildLabelPdf(workspaceId, shipmentIds) {
    const normalizedIds = normalizePrintQueueIds(shipmentIds);
    if (!normalizedIds.length) {
        return { error: { body: { error: 'No hay etiquetas seleccionadas' }, status: 400 } };
    }
    if (normalizedIds.length > 500) {
        return { error: { body: { error: 'Maximo 500 etiquetas por PDF' }, status: 400 } };
    }

    const placeholders = normalizedIds.map(() => '?').join(', ');
    const result = await db.execute({
        sql: `SELECT id, raw_zpl FROM shipments WHERE workspace_id = ? AND id IN (${placeholders})`,
        args: [workspaceId, ...normalizedIds],
    });

    const byId = new Map(result.rows.map((row) => [Number(row.id), row]));
    // Mantener el orden solicitado y descartar las que no existen o no tienen ZPL
    const usableIds = normalizedIds.filter((id) => String(byId.get(id)?.raw_zpl || '').trim());

    if (!usableIds.length) {
        return { error: { body: { error: 'Etiqueta no disponible. No hay ZPL para imprimir.' }, status: 404 } };
    }

    const blocks = usableIds.map((id) => String(byId.get(id).raw_zpl).trim());
    const zpl = blocks.join('\r\n');
    const dims = extractLabelDimensionsInches(blocks[0]);

    // Sin indice de etiqueta => Labelary devuelve un PDF multipagina (una por etiqueta)
    const labelaryUrl = `https://api.labelary.com/v1/printers/8dpmm/labels/${dims.width}x${dims.height}/`;
    const attemptHeaders = [
        { Accept: 'application/pdf', 'Content-Type': 'application/x-www-form-urlencoded' },
        { Accept: 'application/pdf', 'Content-Type': 'text/plain' },
    ];

    let response = null;
    for (const headers of attemptHeaders) {
        response = await fetch(labelaryUrl, {
            method: 'POST',
            headers,
            body: zpl,
        });
        if (response.ok || response.status !== 415) {
            break;
        }
    }

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('Labelary PDF error:', errorText);
        return { error: { body: { error: `Labelary: ${errorText}` }, status: 502 } };
    }

    const pdfBuffer = await response.arrayBuffer();
    return { pdfBuffer };
}

function pdfResponse(pdfBuffer) {
    return new NextResponse(pdfBuffer, {
        headers: {
            'Content-Type': 'application/pdf',
            'Cache-Control': 'no-store',
        },
    });
}

export async function GET(request) {
    try {
        await ensureDb();
        const authResult = await requireWorkspaceActor(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const workspaceId = authResult.actor.workspaceId;
        const { searchParams } = new URL(request.url);
        const shipmentId = searchParams.get('shipmentId');

        if (!shipmentId) {
            return NextResponse.json({ error: 'Missing shipmentId parameter' }, { status: 400 });
        }

        const { pdfBuffer, error } = await buildLabelPdf(workspaceId, [shipmentId]);
        if (error) {
            return NextResponse.json(error.body, { status: error.status });
        }
        return pdfResponse(pdfBuffer);
    } catch (error) {
        console.error('Error rendering label PDF:', error);
        return NextResponse.json({ error: 'Failed to render label PDF' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        await ensureDb();
        const authResult = await requireWorkspaceActor(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const workspaceId = authResult.actor.workspaceId;
        const body = await request.json().catch(() => ({}));
        const ids = body?.ids;

        const { pdfBuffer, error } = await buildLabelPdf(workspaceId, ids);
        if (error) {
            return NextResponse.json(error.body, { status: error.status });
        }
        return pdfResponse(pdfBuffer);
    } catch (error) {
        console.error('Error rendering label PDF:', error);
        return NextResponse.json({ error: 'Failed to render label PDF' }, { status: 500 });
    }
}
