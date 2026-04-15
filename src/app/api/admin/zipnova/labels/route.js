import { NextResponse } from 'next/server';
import { requireWorkspaceAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { markZipnovaShipmentsDownloaded } from '@/lib/zipnovaStore';
import { resolveZipnovaClient } from '@/lib/zipnovaResolver';

function decodeBase64ToBytes(base64) {
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

export async function POST(request) {
  try {
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const body = await request.json();
    const shipmentIds = Array.isArray(body?.shipmentIds) ? body.shipmentIds.filter(Boolean) : [];
    const group = body?.group || 'labels';

    if (!shipmentIds.length) {
      return NextResponse.json({ error: 'No hay envíos para descargar etiquetas' }, { status: 400 });
    }

    const client = await resolveZipnovaClient(authResult.actor.workspaceId);

    const { PDFDocument } = await import('pdf-lib');
    const mergedPdf = await PDFDocument.create();
    const downloadedShipmentIds = [];
    const skippedShipmentIds = [];

    for (const shipmentId of shipmentIds) {
      try {
        const documentation = await client.getShipmentDocumentation(shipmentId, { what: 'label', format: 'pdf' });
        const rawBody = documentation?.body;
        const format = String(documentation?.format || 'pdf').toLowerCase();

        if (!rawBody || format !== 'pdf') {
          skippedShipmentIds.push(String(shipmentId));
          continue;
        }

        const sourcePdf = await PDFDocument.load(decodeBase64ToBytes(rawBody));
        const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
        downloadedShipmentIds.push(String(shipmentId));
      } catch (error) {
        skippedShipmentIds.push(String(shipmentId));
      }
    }

    if (!downloadedShipmentIds.length || mergedPdf.getPageCount() === 0) {
      return NextResponse.json({ error: 'Ningun envio seleccionado tiene etiqueta disponible en Zipnova todavia' }, { status: 400 });
    }

    const actorLabel = authResult.actor.email || authResult.actor.username;
    await markZipnovaShipmentsDownloaded(downloadedShipmentIds, actorLabel);

    await Promise.all(
      downloadedShipmentIds.map((shipmentId) => logAudit({
        workspaceId: authResult.actor.workspaceId,
        appUserId: authResult.actor.appUserId,
        actorType: authResult.actor.authType,
        actorLabel,
        action: 'zipnova_label_downloaded',
        entityType: 'zipnova_shipment',
        entityId: shipmentId,
        metadata: { group },
      }))
    );

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
