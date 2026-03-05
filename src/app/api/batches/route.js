import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';

export async function GET() {
    try {
        await ensureDb();
        const result = await db.execute(`
            SELECT
                b.id,
                b.date,
                (SELECT COUNT(*) FROM shipments s WHERE s.batch_id = b.id) AS total_packages,
                b.filenames,
                b.created_at
            FROM daily_batches b
            ORDER BY b.id DESC
            LIMIT 20
        `);
        return NextResponse.json(result.rows);
    } catch (error) {
        console.error("Batches error:", error);
        return NextResponse.json({ error: "Failed to load batches" }, { status: 500 });
    }
}
