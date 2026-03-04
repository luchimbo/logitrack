import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function DELETE(request, { params }) {
    try {
        const { id } = params;
        await db.execute({
            sql: "DELETE FROM carriers WHERE id = ?",
            args: [id]
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting carrier:", error);
        return NextResponse.json({ error: "Failed to delete carrier" }, { status: 500 });
    }
}
