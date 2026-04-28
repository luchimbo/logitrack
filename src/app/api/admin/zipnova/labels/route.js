import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { markZipnovaShipmentsDownloaded } from '@/lib/zipnovaStore';
import { resolveZipnovaClient } from '@/lib/zipnovaResolver';

function decodeBase64ToBytes(base64) {
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

function extractDocumentationBody(documentation) {
  if (!documentation) return '';
  if (typeof documentation === 'string') return documentation;
  return documentation.body || documentation.content || documentation.data || documentation.file || documentation.raw || '';
}

function decodeBase64ToText(base64) {
  return Buffer.from(base64, 'base64').toString('utf8');
}

export async function POST(request) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const body = await request.json();
    const shipmentIds = Array.isArray(body?.shipmentIds) ? body.shipmentIds.filter(Boolean) : [];
    const group = body?.group || 'labels';
    const requestedFormat = String(body?.format || 'pdf').toLowerCase() === 'zpl' ? 'zpl' : 'pdf';

    if (!shipmentIds.length) {
      return NextResponse.json({ error: 'No hay envíos para descargar etiquetas' }, { status: 400 });
    }

    const client = await resolveZipnovaClient(authResult.actor.workspaceId);

    const { PDFDocument } = requestedFormat === 'pdf' ? await import('pdf-lib') : { PDFDocument: null };
    const mergedPdf = requestedFormat === 'pdf' ? await PDFDocument.create() : null;
    const zplBlocks = [];
    const downloadedShipmentIds = [];
    const skippedShipmentIds = [];

    for (const shipmentId of shipmentIds) {
      try {
        const documentation = await client.getShipmentDocumentation(shipmentId, { what: 'label', format: requestedFormat, noStatusChange: true });
        const rawBody = extractDocumentationBody(documentation);
        const format = String(documentation?.format || requestedFormat).toLowerCase();

        if (!rawBody || format !== requestedFormat) {
          skippedShipmentIds.push(String(shipmentId));
          continue;
        }

        if (requestedFormat === 'pdf') {
          const sourcePdf = await PDFDocument.load(decodeBase64ToBytes(rawBody));
          const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
          copiedPages.forEach((page) => mergedPdf.addPage(page));
        } else {
          zplBlocks.push(decodeBase64ToText(rawBody).trim());
        }
        downloadedShipmentIds.push(String(shipmentId));
      } catch (error) {
        skippedShipmentIds.push(String(shipmentId));
      }
    }

    if (!downloadedShipmentIds.length || (requestedFormat === 'pdf' && mergedPdf.getPageCount() === 0) || (requestedFormat === 'zpl' && zplBlocks.length === 0)) {
      return NextResponse.json({ error: 'Ningun envio seleccionado tiene etiqueta disponible en Zipnova todavia' }, { status: 400 });
    }

    const actorLabel = authResult.actor.email || authResult.actor.username;
    await markZipnovaShipmentsDownloaded(downloadedShipmentIds, actorLabel, requestedFormat);

    await Promise.all(
      downloadedShipmentIds.map((shipmentId) => logAudit({
        workspaceId: authResult.actor.workspaceId,
        appUserId: authResult.actor.appUserId,
        actorType: authResult.actor.authType,
        actorLabel,
        action: requestedFormat === 'zpl' ? 'zipnova_label_zpl_downloaded' : 'zipnova_label_pdf_downloaded',
        entityType: 'zipnova_shipment',
        entityId: shipmentId,
        metadata: { group, format: requestedFormat },
      }))
    );

    if (requestedFormat === 'zpl') {
      const fileName = `etiquetas-${group}-${new Date().toISOString().slice(0, 10)}.zpl`;
      return new NextResponse(zplBlocks.join('\r\n'), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.zebra-zpl',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'X-Zipnova-Downloaded': String(downloadedShipmentIds.length),
          'X-Zipnova-Skipped': String(skippedShipmentIds.length),
        },
      });
    }

    const mergedBytes = await mergedPdf.save();
    const fileName = `etiquetas-${group}-${new Date().toISOString().slice(0, 10)}.pdf`;

    return new NextResponse(Buffer.from(mergedBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'X-Zipnova-Downloaded': String(downloadedShipmentIds.length),
        'X-Zipnova-Skipped': String(skippedShipmentIds.length),
      },
    });
  } catch (error) {
    console.error('Zipnova labels error:', error);
    return NextResponse.json({ error: error.message || 'Error al descargar etiquetas Zipnova' }, { status: 500 });
  }
}
