import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';

export async function GET(request, { params }) {
    try {
        await ensureDb();
        const authResult = await requireWorkspaceActor(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const workspaceId = authResult.actor.workspaceId;
        const { id } = await params;

        const result = await db.execute({
            sql: "SELECT raw_zpl FROM shipments WHERE id = ? AND workspace_id = ?",
            args: [id, workspaceId]
        });

        if (result.rows.length === 0) {
            return NextResponse.json({ error: "Envío no encontrado" }, { status: 404 });
        }

        const rawZpl = result.rows[0].raw_zpl;

        if (!rawZpl) {
            return NextResponse.json({ error: "Etiqueta no disponible. Este envío fue cargado antes de activar la vista previa." }, { status: 404 });
        }

        return new NextResponse(rawZpl, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cache-Control': 'public, max-age=86400',
            },
        });
    } catch (error) {
        console.error("Error fetching label:", error);
        return NextResponse.json({ error: "Failed to fetch label" }, { status: 500 });
    }
}
