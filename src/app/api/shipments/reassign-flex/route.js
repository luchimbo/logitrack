import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { assignCarrier } from '@/lib/zoneMapper';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';

export async function POST(request) {
    try {
        await ensureDb();
        const authResult = await requireWorkspaceActor(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const workspaceId = authResult.actor.workspaceId;
        const { searchParams } = new URL(request.url);
        const batch_id = searchParams.get('batch_id');

        let sql = "SELECT id, partido, assigned_carrier FROM shipments WHERE workspace_id = ? AND shipping_method = 'flex'";
        const args = [workspaceId];

        if (batch_id) {
            sql += " AND batch_id = ?";
            args.push(batch_id);
        }

        const result = await db.execute({ sql, args });
        const shipments = result.rows;

        let updatedCount = 0;

        for (const s of shipments) {
            const newCarrier = await assignCarrier(s.partido, workspaceId);
            if (s.assigned_carrier !== newCarrier) {
                await db.execute({
                    sql: "UPDATE shipments SET assigned_carrier = ? WHERE id = ? AND workspace_id = ?",
                    args: [newCarrier, s.id, workspaceId]
                });
                updatedCount++;
            }
        }

        return NextResponse.json({ updated: updatedCount, total_checked: shipments.length });
    } catch (error) {
        console.error("Error reassigning flex carriers:", error);
        return NextResponse.json({ error: "Failed to reassign carriers" }, { status: 500 });
    }
}
