import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';

// Detecta el tipo de respuesta de Mercado Libre por magic bytes.
function startsWith(bytes, signature) {
    if (bytes.length < signature.length) return false;
    for (let i = 0; i < signature.length; i++) {
        if (bytes[i] !== signature[i]) return false;
    }
    return true;
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const ZIP_MAGIC = [0x50, 0x4b]; // PK

// Normaliza la respuesta de ML (PDF directo o ZIP con varios PDF) a un único PDF.
async function normalizeToPdf(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);

    if (startsWith(bytes, PDF_MAGIC)) {
        return Buffer.from(bytes);
    }

    if (startsWith(bytes, ZIP_MAGIC)) {
        const { unzipSync } = await import('fflate');
        const files = unzipSync(bytes);
        const pdfs = Object.entries(files)
            .filter(([name]) => /\.pdf$/i.test(name))
            .map(([, data]) => data);

        if (!pdfs.length) return null;
        if (pdfs.length === 1) return Buffer.from(pdfs[0]);

        // Combinar varios PDF en uno solo.
        const { PDFDocument } = await import('pdf-lib');
        const merged = await PDFDocument.create();
        for (const data of pdfs) {
            const doc = await PDFDocument.load(data);
            const pages = await merged.copyPages(doc, doc.getPageIndices());
            pages.forEach((page) => merged.addPage(page));
        }
        const out = await merged.save();
        return Buffer.from(out);
    }

    return null;
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

        const orderIdsParam = searchParams.get('orderIds') || searchParams.get('orderId') || '';
        const connectionId = searchParams.get('connectionId') || '';
        const orderIds = orderIdsParam.split(',').map((s) => s.trim()).filter(Boolean);

        if (!orderIds.length) {
            return NextResponse.json({ error: 'Falta orderId/orderIds' }, { status: 400 });
        }
        if (!connectionId) {
            return NextResponse.json({ error: 'Falta connectionId' }, { status: 400 });
        }

        // Resolver los shipment_id (ML externo) a partir de los order_id del workspace.
        const placeholders = orderIds.map(() => '?').join(', ');
        const result = await db.execute({
            sql: `SELECT order_id, shipment_id FROM mercadolibre_orders
                  WHERE workspace_id = ? AND order_id IN (${placeholders})`,
            args: [workspaceId, ...orderIds],
        });

        const shipmentIds = [...new Set(
            result.rows
                .map((row) => String(row.shipment_id || '').trim())
                .filter(Boolean),
        )];

        if (!shipmentIds.length) {
            return NextResponse.json({ error: 'Las ventas no tienen envío asignado en Mercado Libre' }, { status: 404 });
        }

        // Reconstruir el cliente de la conexión ML.
        const targets = await listMercadoLibreClientTargets(workspaceId, { connectionId });
        const target = targets[0];
        if (!target?.client) {
            return NextResponse.json({ error: 'Conexión de Mercado Libre no disponible' }, { status: 404 });
        }

        let buffer;
        try {
            buffer = await target.client.downloadShipmentLabelsPdf(shipmentIds);
        } catch (err) {
            console.error('ML label PDF download error:', err);
            return NextResponse.json({ error: 'Mercado Libre no pudo generar la etiqueta PDF' }, { status: 502 });
        }

        const pdf = await normalizeToPdf(buffer);
        if (!pdf) {
            return NextResponse.json({ error: 'Mercado Libre no devolvió una etiqueta PDF válida' }, { status: 502 });
        }

        return new NextResponse(pdf, {
            headers: {
                'Content-Type': 'application/pdf',
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Error rendering ML label PDF:', error);
        return NextResponse.json({ error: 'Failed to render ML label PDF' }, { status: 500 });
    }
}
