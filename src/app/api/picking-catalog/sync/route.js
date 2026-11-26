import { NextResponse } from 'next/server';
import { requireWorkspaceAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { listIntegrationConnections } from '@/lib/integrationService';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { createPickingCatalogRepository, fetchSellerCatalog } from '@/lib/pickingCatalog';

export const maxDuration = 300;
const catalog = createPickingCatalogRepository(db);

// Descarga de nuevo las publicaciones de cada cuenta de Mercado Libre del espacio.
export async function POST(request) {
    try {
        const auth = await requireWorkspaceAdmin(request);
        if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
        const { workspaceId } = auth.actor;
        if (!workspaceId) return NextResponse.json({ error: 'Workspace no disponible' }, { status: 403 });

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
        return NextResponse.json({ accounts, failedAccounts }, { status: accounts.length || !connections.length ? 200 : 502 });
    } catch (error) {
        console.error('Descarga de catálogo', error);
        return NextResponse.json({ error: 'No pudimos actualizar el catálogo. Volvé a intentar.' }, { status: 500 });
    }
}
