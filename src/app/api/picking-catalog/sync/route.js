import { NextResponse, after } from 'next/server';
import { requireWorkspaceActor, requireWorkspaceAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { listIntegrationConnections } from '@/lib/integrationService';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { createPickingCatalogRepository, fetchSellerCatalog } from '@/lib/pickingCatalog';
import { claimBackgroundJob, finishBackgroundJob, readBackgroundJob } from '@/lib/backgroundJobs';

export const maxDuration = 300;
const catalog = createPickingCatalogRepository(db);
const JOB_KIND = 'picking-catalog-sync';

// Descarga de nuevo las publicaciones de cada cuenta de Mercado Libre del espacio.
async function syncCatalog(workspaceId) {
    const connections = await listIntegrationConnections({ workspaceId, provider: 'mercadolibre' });
    const accounts = [];
    const failedAccounts = [];
    for (const connection of connections) {
        try {
            const [target] = await listMercadoLibreClientTargets(workspaceId, { connectionId: connection.id });
            if (!target) throw new Error('Conexión sin credenciales');
            const items = await fetchSellerCatalog(target.client, target.externalStoreId);
            const saved = await catalog.replaceConnection(workspaceId, connection.id, items);
            accounts.push({ name: connection.displayName, ...saved });
        } catch (error) {
            console.error('Catálogo Mercado Libre', connection.id, error.message);
            failedAccounts.push(connection.displayName);
        }
    }
    return { accounts, failedAccounts };
}

// Responde enseguida y descarga en segundo plano: un catálogo grande ya no deja la
// pantalla esperando ni se pierde si se cierra la pestaña.
export async function POST(request) {
    try {
        const auth = await requireWorkspaceAdmin(request);
        if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
        const { workspaceId } = auth.actor;
        if (!workspaceId) return NextResponse.json({ error: 'Workspace no disponible' }, { status: 403 });

        const { started, job } = await claimBackgroundJob(db, workspaceId, JOB_KIND);
        if (started) {
            after(async () => {
                try {
                    await finishBackgroundJob(db, workspaceId, JOB_KIND, { result: await syncCatalog(workspaceId) });
                } catch (error) {
                    console.error('Descarga de catálogo', error);
                    await finishBackgroundJob(db, workspaceId, JOB_KIND, { error }).catch(() => {});
                }
            });
        }
        return NextResponse.json({ job, started }, { status: 202 });
    } catch (error) {
        console.error('Descarga de catálogo', error);
        return NextResponse.json({ error: 'No pudimos actualizar el catálogo. Volvé a intentar.' }, { status: 500 });
    }
}

export async function GET(request) {
    try {
        const auth = await requireWorkspaceActor(request);
        if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
        const { workspaceId } = auth.actor;
        if (!workspaceId) return NextResponse.json({ job: null });
        return NextResponse.json({ job: await readBackgroundJob(db, workspaceId, JOB_KIND) }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Estado de descarga de catálogo', error);
        return NextResponse.json({ error: 'No pudimos leer el estado del catálogo.' }, { status: 500 });
    }
}
