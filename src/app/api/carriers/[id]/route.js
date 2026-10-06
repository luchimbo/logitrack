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
        const carrier = await db.execute({
            sql: "SELECT name FROM carriers WHERE id = ? AND workspace_id = ? LIMIT 1",
            args: [id, GLOBAL_CARRIER_CONFIG_SCOPE]
        });
        if (!carrier.rows.length) {
            return NextResponse.json({ error: "Transportista no encontrado" }, { status: 404 });
        }
        await db.execute({
            sql: "DELETE FROM carrier_portal_links WHERE carrier_id = ?",
            args: [id]
        });
        await db.execute({
            sql: "DELETE FROM zone_mappings WHERE workspace_id = ? AND carrier_name = ?",
            args: [GLOBAL_CARRIER_CONFIG_SCOPE, carrier.rows[0].name]
        });
        await db.execute({
            sql: "DELETE FROM carriers WHERE id = ? AND workspace_id = ?",
            args: [id, GLOBAL_CARRIER_CONFIG_SCOPE]
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting carrier:", error);
        return NextResponse.json({ error: "Failed to delete carrier" }, { status: 500 });
    }
}
