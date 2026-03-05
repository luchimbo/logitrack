import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';

export async function DELETE(request, { params }) {
    try {
        await ensureDb();
        const { id } = await params;

        const shipmentResult = await db.execute({
            sql: "SELECT id, batch_id FROM shipments WHERE id = ?",
            args: [id]
        });

        if (shipmentResult.rows.length === 0) {
            return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
        }

        const batchId = shipmentResult.rows[0].batch_id;

        await db.execute({
            sql: "DELETE FROM shipments WHERE id = ?",
            args: [id]
        });

        if (batchId !== null && batchId !== undefined) {
            await db.execute({
                sql: "UPDATE daily_batches SET total_packages = (SELECT COUNT(*) FROM shipments WHERE batch_id = ?) WHERE id = ?",
                args: [batchId, batchId]
            });
        }

        return NextResponse.json({ success: true, deleted: id });
    } catch (error) {
        console.error("Error deleting shipment:", error);
        return NextResponse.json({ error: "Failed to delete shipment" }, { status: 500 });
    }
}
