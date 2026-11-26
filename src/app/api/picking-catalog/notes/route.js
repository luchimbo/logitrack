import { NextResponse } from 'next/server';
import { requireWorkspaceAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { createPickingCatalogRepository, MAX_NOTE_LENGTH } from '@/lib/pickingCatalog';

const catalog = createPickingCatalogRepository(db);

// Aplica el mismo texto extra a uno o varios productos (claves del catálogo). Un texto vacío lo quita.
export async function PUT(request) {
    try {
        const auth = await requireWorkspaceAdmin(request);
        if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
        const { workspaceId, email, id } = auth.actor;
        if (!workspaceId) return NextResponse.json({ error: 'Workspace no disponible' }, { status: 403 });

        const body = await request.json().catch(() => null);
        const keys = Array.isArray(body?.keys) ? body.keys.filter((value) => typeof value === 'string') : [];
        if (!keys.length || keys.length > 3000) {
            return NextResponse.json({ error: 'Elegí al menos un producto' }, { status: 400 });
        }
        if (typeof body.note !== 'string' || body.note.trim().length > MAX_NOTE_LENGTH) {
            return NextResponse.json({ error: `El texto puede tener hasta ${MAX_NOTE_LENGTH} caracteres` }, { status: 400 });
        }
        const updated = await catalog.setNotes(workspaceId, keys, body.note, email || id);
        return NextResponse.json({ updated });
    } catch (error) {
        if (error.status === 400) return NextResponse.json({ error: error.message }, { status: 400 });
        console.error('Texto extra de picking', error);
        return NextResponse.json({ error: 'No pudimos guardar el texto. Volvé a intentar.' }, { status: 500 });
    }
}
