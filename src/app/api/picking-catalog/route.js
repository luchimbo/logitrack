import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { db } from '@/lib/db';
import { listIntegrationConnections } from '@/lib/integrationService';
import { createPickingCatalogRepository, MAX_NOTE_LENGTH } from '@/lib/pickingCatalog';

const catalog = createPickingCatalogRepository(db);

export async function GET(request) {
    try {
        const auth = await requireWorkspaceActor(request);
        if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
        const { workspaceId, role, isGlobalAdmin } = auth.actor;
        if (!workspaceId) return NextResponse.json({ error: 'Workspace no disponible' }, { status: 403 });

        const [items, connections] = await Promise.all([
            catalog.list(workspaceId),
            listIntegrationConnections({ workspaceId, provider: 'mercadolibre' }),
        ]);
        const accounts = Object.fromEntries(connections.map((connection) => [connection.id, connection.displayName]));
        const syncedAt = items.reduce((latest, item) => (item.synced_at > latest ? item.synced_at : latest), '');
        return NextResponse.json({
            items: items.map(({ synced_at: _, hasSavedNote: __, ...item }) => ({
                ...item,
                accounts: [...new Set(item.listings.map((listing) => accounts[listing.connection_id]).filter(Boolean))],
            })),
            connectedAccounts: connections.length,
            syncedAt: syncedAt || null,
            canEdit: Boolean(isGlobalAdmin || ['owner', 'admin'].includes(role)),
            maxNoteLength: MAX_NOTE_LENGTH,
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Catálogo de picking', error);
        return NextResponse.json({ error: 'No pudimos cargar el catálogo. Volvé a intentar.' }, { status: 500 });
    }
}
