import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { db } from '@/lib/db';
import { getArgentinaDateString } from '@/lib/dateUtils';
import { listIntegrationConnections } from '@/lib/integrationService';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { groupPickingProducts, listMercadoLibrePickingPackages } from '@/lib/mercadoLibrePicking';
import { createPickingExportRepository } from '@/lib/pickingExports';
import { createPickingCatalogRepository, pickingNotesFor } from '@/lib/pickingCatalog';

export const maxDuration = 120;
const pickingExports = createPickingExportRepository(db);
const pickingCatalog = createPickingCatalogRepository(db);

async function picking(request, exportPdf = false) {
    try {
        const auth = await requireWorkspaceActor(request);
        if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

        const { workspaceId } = auth.actor;
        if (!workspaceId) return NextResponse.json({ error: 'Workspace no disponible' }, { status: 403 });
        const connections = await listIntegrationConnections({ workspaceId, provider: 'mercadolibre' });
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]);
        const results = await Promise.allSettled(connections.map(async (connection) => {
            const [target] = await listMercadoLibreClientTargets(workspaceId, { connectionId: connection.id });
            if (!target) throw new Error('Conexión sin credenciales');
            return listMercadoLibrePickingPackages(target.client, target.externalStoreId, signal);
        }));
        const packages = [];
        const failedAccounts = [];
        for (const [index, result] of results.entries()) {
            const connection = connections[index];
            if (result.status === 'fulfilled') {
                packages.push(...result.value);
            } else {
                failedAccounts.push(connection.displayName);
                console.error('Picking Mercado Libre', connection.id, result.reason?.message);
            }
        }

        // Si no se puede leer el texto extra, el picking sale igual con las fuentes conocidas.
        const decorate = (items) => pickingCatalog.decorate(workspaceId, items).catch((error) => {
            console.error('Texto extra de picking', error.message);
            return items.map((item) => ({ ...item, notes: pickingNotesFor(item, new Map()) }));
        });
        const { lastExport, pending, created = false } = exportPdf && !failedAccounts.length
            ? await pickingExports.save(workspaceId, packages, decorate)
            : await pickingExports.read(workspaceId, packages);
        const status = {
            connectedAccounts: connections.length,
            failedAccounts,
            packageCount: pending.length,
            supplemental: lastExport?.date === getArgentinaDateString(),
        };
        const options = { headers: { 'Cache-Control': 'no-store' } };
        if (!exportPdf && new URL(request.url).searchParams.get('view') === 'summary') {
            const byMethod = { colecta: 0, flex: 0 };
            for (const shipment of packages) byMethod[shipment.shippingMethod]++;
            return NextResponse.json({ ...status, byMethod, totalPackages: packages.length }, options);
        }
        return NextResponse.json({
            ...status,
            items: await decorate(groupPickingProducts(pending)),
            lastExport,
            created,
        }, options);
    } catch (error) {
        console.error('Picking list error:', error);
        return NextResponse.json({ error: 'No pudimos cargar el picking. Volvé a intentar.' }, { status: 500 });
    }
}

export function GET(request) {
    return picking(request);
}

export function POST(request) {
    if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') {
        return NextResponse.json({ error: 'Formato de solicitud inválido' }, { status: 415 });
    }
    return picking(request, true);
}
