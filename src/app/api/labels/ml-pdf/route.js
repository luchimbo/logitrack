import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';

// Extrae solo los bloques ZPL (la etiqueta) del ZIP que devuelve ML; ignora el remito
// (Control.pdf) y cualquier otro adjunto. Mismo criterio que extractZplLabelsFromZip.
async function extractZplFromMlZip(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    // Si por algún motivo no es ZIP (PK), no hay ZPL utilizable.
    if (bytes.length < 2 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return [];
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(bytes);
    const labels = [];
    for (const [name, data] of Object.entries(files)) {
        if (!/\.(txt|zpl)$/i.test(name)) continue;
        const text = strFromU8(data).trim();
        if (text) labels.push(text);
    }
    return labels;
}

// Renderiza ZPL concatenado a un PDF multipágina 4x6 (tamaño térmico) vía Labelary.
async function zplToPdf4x6(zpl) {
    const labelaryUrl = 'https://api.labelary.com/v1/printers/8dpmm/labels/4x6/';
    const attemptHeaders = [
        { Accept: 'application/pdf', 'Content-Type': 'application/x-www-form-urlencoded' },
        { Accept: 'application/pdf', 'Content-Type': 'text/plain' },
    ];
    let response = null;
    for (const headers of attemptHeaders) {
        response = await fetch(labelaryUrl, { method: 'POST', headers, body: zpl });
        if (response.ok || response.status !== 415) break;
    }
    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Labelary: ${errorText}`);
    }
    return Buffer.from(await response.arrayBuffer());
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

        // Pedir el ZPL (solo la etiqueta, sin remito) y renderizarlo a PDF 4x6.
        let zipBuffer;
        try {
            zipBuffer = await target.client.downloadShipmentLabelsZpl(shipmentIds);
        } catch (err) {
            console.error('ML label ZPL download error:', err);
            return NextResponse.json({ error: 'Mercado Libre no pudo generar la etiqueta (¿la venta sigue lista para imprimir?)' }, { status: 502 });
        }

        const labels = await extractZplFromMlZip(zipBuffer);
        if (!labels.length) {
            return NextResponse.json({ error: 'Mercado Libre no devolvió la etiqueta en formato imprimible' }, { status: 502 });
        }

        let pdf;
        try {
            pdf = await zplToPdf4x6(labels.join('\r\n'));
        } catch (err) {
            console.error('Labelary render error:', err);
            return NextResponse.json({ error: 'No se pudo generar el PDF de la etiqueta' }, { status: 502 });
        }

        return new NextResponse(pdf, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline; filename="etiqueta.pdf"',
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Error rendering ML label PDF:', error);
        return NextResponse.json({ error: 'Failed to render ML label PDF' }, { status: 500 });
    }
}
