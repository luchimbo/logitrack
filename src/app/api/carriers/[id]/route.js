import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceAdmin } from '@/lib/auth';

export async function DELETE(request, { params }) {
    try {
        await ensureDb();
        const authResult = await requireWorkspaceAdmin(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const { id } = await params;
        await db.execute({
            sql: "DELETE FROM carriers WHERE id = ? AND workspace_id = ?",
            args: [id, authResult.actor.workspaceId]
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting carrier:", error);
        return NextResponse.json({ error: "Failed to delete carrier" }, { status: 500 });
    }
}
