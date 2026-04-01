import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';

export async function DELETE(request, { params }) {
    try {
        await ensureDb();
        const { id } = await params;
        await db.execute({
            sql: "DELETE FROM zone_mappings WHERE id = ?",
            args: [id]
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting zone:", error);
        return NextResponse.json({ error: "Failed to delete zone" }, { status: 500 });
    }
}
