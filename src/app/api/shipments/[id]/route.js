import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function DELETE(request, { params }) {
    try {
        const { id } = await params;
        await db.execute({
            sql: "DELETE FROM shipments WHERE id = ?",
            args: [id]
        });
        return NextResponse.json({ success: true, deleted: id });
    } catch (error) {
        console.error("Error deleting shipment:", error);
        return NextResponse.json({ error: "Failed to delete shipment" }, { status: 500 });
    }
}
