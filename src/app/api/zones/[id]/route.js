import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceAdmin } from '@/lib/auth';
import { ensureGlobalCarrierConfig, GLOBAL_CARRIER_CONFIG_SCOPE } from '@/lib/globalCarrierConfig';

export async function DELETE(request, { params }) {
    try {
        await ensureDb();
        const authResult = await requireWorkspaceAdmin(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const { id } = await params;
        await ensureGlobalCarrierConfig();
        await db.execute({
            sql: "DELETE FROM zone_mappings WHERE id = ? AND workspace_id = ?",
            args: [id, GLOBAL_CARRIER_CONFIG_SCOPE]
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting zone:", error);
        return NextResponse.json({ error: "Failed to delete zone" }, { status: 500 });
    }
}
