import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';

export const maxDuration = 60;

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

const DPMM = 8; // densidad de impresión de las etiquetas ML
const DPI = DPMM * 25.4; // 203.2 dpi

const LABEL_WIDTH_IN = 3.94; // 10 cm — ancho estándar de las etiquetas térmicas de ML
const LABEL_HEIGHT_DOTS = 1200; // 15 cm a 8 dpmm

// Divide un ZPL con varias etiquetas concatenadas en bloques individuales ^XA ... ^XZ y
// descarta los bloques vacíos (ML a veces agrega un ^XA^XZ sin contenido que, si se renderiza,
// produce una página en blanco).
function splitZplLabels(zpl) {
    const blocks = (zpl.match(/\^XA[\s\S]*?\^XZ/g) || []).filter((b) => /\^F[OT]\d/.test(b));
    return blocks.length ? blocks : [zpl];
}

// Alto de UNA etiqueta en pulgadas. El ZPL de ML NO trae ^LL/^PW, así que medimos la mayor
// coordenada Y de los campos (^FO/^FT, contemplando ^LH). Piso de 15 cm para que una etiqueta
// normal ocupe toda la hoja 10x15; si el contenido supera los 15 cm (ej. Flex con encabezado
// recortable), se expande para no cortar el pie.
function labelHeightInches(zpl) {
    const regex = /\^F[OT](\d+),(\d+)/gi;
    let maxY = 0, m;
    while ((m = regex.exec(zpl)) !== null) maxY = Math.max(maxY, Number(m[2]) || 0);
    const heightDots = maxY <= LABEL_HEIGHT_DOTS ? LABEL_HEIGHT_DOTS : maxY + 80;
    return Math.min(12, Number((heightDots / DPI).toFixed(2)));
}

async function renderSingleLabelPdf(zpl, height) {
    const labelaryUrl = `https://api.labelary.com/v1/printers/8dpmm/labels/${LABEL_WIDTH_IN}x${height}/`;
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
    return new Uint8Array(await response.arrayBuffer());
}

// Renderiza cada etiqueta a su tamaño real y las une en un PDF multipágina. Así una etiqueta
// 10x15 ocupa una página 10x15 (sin espacio en blanco) y las Flex más altas tampoco se recortan.
async function zplToPdf4x6(zpl) {
    const { PDFDocument } = await import('pdf-lib');
    const labels = splitZplLabels(zpl);
    const merged = await PDFDocument.create();
    for (const label of labels) {
        const bytes = await renderSingleLabelPdf(label, labelHeightInches(label));
        const src = await PDFDocument.load(bytes);
        const pages = await merged.copyPages(src, src.getPageIndices());
        for (const page of pages) merged.addPage(page);
    }
    return Buffer.from(await merged.save());
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

        // Reconstruir el cliente de la conexión ML.
        const targets = await listMercadoLibreClientTargets(workspaceId, { connectionId });
        const target = targets[0];
        if (!target?.client) {
            return NextResponse.json({ error: 'Conexión de Mercado Libre no disponible' }, { status: 404 });
        }

        // Resolver shipment_id y ZPL ya guardado (si se imprimió antes) por order_id.
        const placeholders = orderIds.map(() => '?').join(', ');
        const result = await db.execute({
            sql: `SELECT order_id, shipment_id, printed_label_zpl FROM mercadolibre_orders
                  WHERE workspace_id = ? AND order_id IN (${placeholders})`,
            args: [workspaceId, ...orderIds],
        });

        const shipmentByOrder = new Map();
        const storedZplByOrder = new Map();
        for (const row of result.rows) {
            const oid = String(row.order_id);
            if (String(row.shipment_id || '').trim()) shipmentByOrder.set(oid, String(row.shipment_id).trim());
            if (String(row.printed_label_zpl || '').trim()) storedZplByOrder.set(oid, String(row.printed_label_zpl));
        }

        // Fallback: order_id no sincronizados -> pedir el envío directo a ML.
        for (const orderId of orderIds) {
            if (shipmentByOrder.has(orderId) || storedZplByOrder.has(orderId)) continue;
            try {
                const order = await target.client.getOrder(orderId);
                const shipId = order?.shipping?.id;
                if (shipId) shipmentByOrder.set(orderId, String(shipId));
            } catch (err) {
                console.error('ML getOrder fallback error for', orderId, ':', err?.message || err);
            }
        }

        // Para cada orden: usar el ZPL guardado o, si no hay, descargarlo de ML y guardarlo
        // (así una reimpresión no depende de que ML siga entregando la etiqueta).
        const labelParts = [];
        const errors = [];
        for (const orderId of orderIds) {
            if (storedZplByOrder.has(orderId)) {
                labelParts.push(storedZplByOrder.get(orderId));
                continue;
            }
            const shipmentId = shipmentByOrder.get(orderId);
            if (!shipmentId) { errors.push(orderId); continue; }
            try {
                const zip = await target.client.downloadShipmentLabelsZpl([shipmentId]);
                const labels = await extractZplFromMlZip(zip);
                const zpl = labels.join('\r\n').trim();
                if (!zpl) { errors.push(orderId); continue; }
                labelParts.push(zpl);
                // Persistir para reimpresiones futuras.
                await db.execute({
                    sql: `UPDATE mercadolibre_orders SET printed_label_zpl = ?
                          WHERE workspace_id = ? AND order_id = ?`,
                    args: [zpl, workspaceId, orderId],
                }).catch((e) => console.error('store zpl error', orderId, e?.message || e));
            } catch (err) {
                console.error('ML label ZPL download error for', orderId, ':', err?.message || err);
                errors.push(orderId);
            }
        }

        if (!labelParts.length) {
            return NextResponse.json({
                error: 'Mercado Libre no pudo generar la etiqueta (¿la venta sigue lista para imprimir?)',
            }, { status: 502 });
        }

        let pdf;
        try {
            pdf = await zplToPdf4x6(labelParts.join('\r\n'));
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
