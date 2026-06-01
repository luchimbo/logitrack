import { NextResponse } from 'next/server';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';
import { deleteShipmentsByIds } from '@/lib/shipmentDeletion';

export async function DELETE(request, { params }) {
    try {
        await ensureDb();
        const authResult = await requireWorkspaceActor(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const workspaceId = authResult.actor.workspaceId;
        const resolvedParams = await params;
        const id = Number(resolvedParams?.id);

        if (!Number.isInteger(id) || id <= 0) {
            return NextResponse.json({ error: "Invalid shipment id" }, { status: 400 });
        }

        const result = await deleteShipmentsByIds({ workspaceId, ids: [id] });

        if (!result.deleted) {
            return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, deleted: id });
    } catch (error) {
        console.error("Error deleting shipment:", error);
        return NextResponse.json({ error: "Failed to delete shipment" }, { status: 500 });
    }
}
