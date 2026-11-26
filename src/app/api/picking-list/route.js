import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { db } from '@/lib/db';
import { getArgentinaDateString } from '@/lib/dateUtils';
import { listIntegrationConnections } from '@/lib/integrationService';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { groupPickingProducts, listMercadoLibrePickingPackages } from '@/lib/mercadoLibrePicking';
import { createPickingExportRepository } from '@/lib/pickingExports';

export const maxDuration = 120;
const pickingExports = createPickingExportRepository(db);

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

        const { lastExport, pending, created = false } = exportPdf && !failedAccounts.length
            ? await pickingExports.save(workspaceId, packages)
            : await pickingExports.read(workspaceId, packages);
        return NextResponse.json({
            connectedAccounts: connections.length,
            failedAccounts,
            packageCount: pending.length,
            items: groupPickingProducts(pending),
            lastExport,
            supplemental: lastExport?.date === getArgentinaDateString(),
            created,
        }, { headers: { 'Cache-Control': 'no-store' } });
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
