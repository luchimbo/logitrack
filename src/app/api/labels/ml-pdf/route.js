import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { arrangeLabelsOnA4, zplToPdf } from '@/lib/labelPdfLayout';
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
                  WHERE workspace_id = ? AND integration_connection_id = ? AND order_id IN (${placeholders})`,
            args: [workspaceId, connectionId, ...orderIds],
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
                          WHERE workspace_id = ? AND integration_connection_id = ? AND order_id = ?`,
                    args: [zpl, workspaceId, connectionId, orderId],
                }).catch((e) => console.error('store zpl error', orderId, e?.message || e));
            } catch (err) {
                console.error('ML label ZPL download error for', orderId, ':', err?.message || err);
                errors.push(orderId);
            }
        }

        if (errors.length) {
            return NextResponse.json({ error: `No se pudieron obtener ${errors.length} etiquetas; no se generó un PDF incompleto.` }, { status: 502 });
        }
        if (!labelParts.length) {
            return NextResponse.json({
                error: 'Mercado Libre no pudo generar la etiqueta (¿la venta sigue lista para imprimir?)',
            }, { status: 502 });
        }

        let pdf;
        try {
            pdf = await zplToPdf(labelParts.join('\r\n'));
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

export async function POST(request) {
    const auth = await requireWorkspaceActor(request);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const body = await request.json().catch(() => null);
    const packages = body?.packages;
    const format = body?.format ?? 'original';
    if (!['original', 'pdf', 'thermal', 'zpl'].includes(format)) {
        return NextResponse.json({ error: 'Formato de etiqueta inválido.' }, { status: 400 });
    }
    if (!Array.isArray(packages) || packages.length < 1 || packages.length > 500 ||
        packages.some((item) => !/^\d{1,20}$/.test(String(item?.shipmentId)) ||
            !Number.isSafeInteger(item?.connectionId) || item.connectionId < 1)) {
        return NextResponse.json({ error: 'Seleccioná entre 1 y 500 paquetes con cuenta y envío.' }, { status: 400 });
    }

    try {
        await ensureDb();
        const workspaceId = auth.actor.workspaceId;
        const byAccount = new Map();
        for (const { connectionId, shipmentId } of packages) {
            if (!byAccount.has(connectionId)) byAccount.set(connectionId, new Set());
            byAccount.get(connectionId).add(String(shipmentId));
        }

        const signal = AbortSignal.timeout(42000);

        // Validar todas las cuentas y sus envíos antes de pedir etiquetas.
        const accounts = await Promise.all([...byAccount].map(async ([connectionId, ids]) => {
            const shipmentIds = [...ids];
            const rows = await db.execute({
                sql: `SELECT mo.shipment_id, mo.printed_label_zpl, s.raw_zpl
                      FROM mercadolibre_orders mo
                      LEFT JOIN shipments s ON s.workspace_id = mo.workspace_id AND s.id = mo.shipment_row_id
                      WHERE mo.workspace_id = ? AND mo.integration_connection_id = ?
                      AND mo.shipment_id IN (${shipmentIds.map(() => '?').join(', ')})`,
                args: [workspaceId, connectionId, ...shipmentIds],
            });
            const found = new Set(rows.rows.map((row) => String(row.shipment_id)));
            if (shipmentIds.some((id) => !found.has(id))) {
                throw Object.assign(new Error('Algún envío seleccionado no pertenece a su cuenta de Mercado Libre.'), { status: 404 });
            }
            const cached = new Map();
            for (const row of rows.rows) {
                const zpl = String(row.printed_label_zpl || row.raw_zpl || '').trim();
                if (zpl) cached.set(String(row.shipment_id), zpl);
            }
            const [target] = await listMercadoLibreClientTargets(workspaceId, { connectionId });
            if (!target) throw Object.assign(new Error('Una de las cuentas de Mercado Libre no está disponible.'), { status: 404 });
            return { target, shipmentIds, cached };
        }));

        if (format !== 'original') {
            const byShipment = new Map();
            // Conservar el orden de la selección, incluso entre cuentas.
            await Promise.all(accounts.map(async ({ target, shipmentIds, cached }) => {
                for (const id of shipmentIds) {
                    signal.throwIfAborted();
                    let zpl = cached.get(id);
                    if (!zpl) {
                        try {
                            const zip = await target.client.downloadShipmentLabelsZpl([id], { signal });
                            zpl = (await extractZplFromMlZip(zip)).join('\r\n').trim();
                        } catch {
                            signal.throwIfAborted();
                        }
                    }
                    if (!zpl || !/\^XA[\s\S]+?\^XZ/i.test(zpl)) {
                        throw new Error(`Mercado Libre no entregó la etiqueta del envío ${id} (${target.displayName || target.externalStoreId}).`);
                    }
                    byShipment.set(`${target.connectionId}:${id}`, zpl);
                }
            }));
            const keys = [...new Set(packages.map(({ connectionId, shipmentId }) => `${connectionId}:${shipmentId}`))];
            const zpl = keys.map((key) => byShipment.get(key)).join('\r\n');
            if (format === 'zpl') {
                return new NextResponse(zpl, {
                    headers: {
                        'Content-Type': 'application/vnd.zebra-zpl',
                        'Content-Disposition': 'attachment; filename="etiquetas-mercadolibre.zpl"',
                        'Cache-Control': 'no-store',
                    },
                });
            }
            const pdf = await zplToPdf(zpl, signal);
            return new NextResponse(format === 'pdf' ? await arrangeLabelsOnA4(pdf) : pdf, {
                headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' },
            });
        }

        const { PDFDocument } = await import('pdf-lib');
        const merged = await PDFDocument.create();
        const documents = await Promise.all(accounts.map(async ({ target, shipmentIds, cached }) => {
            const pdfs = [];
            for (let i = 0; i < shipmentIds.length; i += 50) {
                const batch = shipmentIds.slice(i, i + 50);
                try {
                    const bytes = await target.client.downloadShipmentLabelsPdf(batch, { signal });
                    const pdf = await PDFDocument.load(bytes);
                    if (!pdf.getPageCount()) throw new Error('PDF vacío');
                    pdfs.push(pdf);
                } catch {
                    // Si falla el lote, recuperar por envío para identificar errores y permitir reimpresiones.
                    for (const id of batch) {
                        signal.throwIfAborted();
                        try {
                            const bytes = await target.client.downloadShipmentLabelsPdf([id], { signal });
                            const pdf = await PDFDocument.load(bytes);
                            if (!pdf.getPageCount()) throw new Error('PDF vacío');
                            pdfs.push(pdf);
                        } catch {
                            signal.throwIfAborted();
                            const zpl = cached.get(id);
                            if (!zpl) {
                                throw new Error(`Mercado Libre no entregó la etiqueta del envío ${id} (${target.displayName || target.externalStoreId}).`);
                            }
                            pdfs.push(await PDFDocument.load(await zplToPdf(zpl, signal)));
                        }
                    }
                }
            }
            return pdfs;
        }));

        for (const pdf of documents.flat()) {
            for (const page of await merged.copyPages(pdf, pdf.getPageIndices())) merged.addPage(page);
        }
        return new NextResponse(Buffer.from(await merged.save()), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline; filename="etiquetas-mercadolibre.pdf"',
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
            return NextResponse.json({ error: 'La preparación tardó demasiado. Intentá con menos paquetes.' }, { status: 504 });
        }
        console.error('Mercado Libre package PDF:', error);
        return NextResponse.json({ error: error.status === 404 || error.message?.startsWith('Mercado Libre no entregó')
            ? error.message : 'No se pudo preparar el archivo completo de etiquetas.' }, { status: error.status || 502 });
    }
}
