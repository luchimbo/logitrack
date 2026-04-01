import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';

export async function GET(request) {
    try {
        await ensureDb();
        const authResult = await requireWorkspaceActor(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const workspaceId = authResult.actor.workspaceId;
        const result = await db.execute({
            sql: `
                SELECT
                    b.id,
                    b.date,
                    (SELECT COUNT(*) FROM shipments s WHERE s.workspace_id = b.workspace_id AND s.batch_id = b.id) AS total_packages,
                    b.filenames,
                    b.created_at
                FROM daily_batches b
                WHERE b.workspace_id = ?
                ORDER BY b.id DESC
                LIMIT 20
            `,
            args: [workspaceId],
        });
        return NextResponse.json(result.rows);
    } catch (error) {
        console.error("Batches error:", error);
        return NextResponse.json({ error: "Failed to load batches" }, { status: 500 });
    }
}
